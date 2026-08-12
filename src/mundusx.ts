import {
  conversationResponseSchema,
  type ConversationRequest,
  type ConversationResponse,
} from "./schemas.js";
import type { AppConfig } from "./config.js";

export interface ConversationAnalyzer {
  analyze(input: ConversationRequest): Promise<ConversationResponse>;
}

const systemPrompt = `You are a German conversation helper. Return only one valid JSON object, without markdown or commentary. Use this exact shape: {"speechAct":"information","topic":"short English topic","meaning":"short English meaning","replies":[{"kind":"supportive","text":"short German reply","meaning":"English translation","purpose":"short English purpose"},{"kind":"continue","text":"short German reply","meaning":"English translation","purpose":"short English purpose"},{"kind":"alternative","text":"short German reply","meaning":"English translation","purpose":"short English purpose"}]}. speechAct must be question, opinion, information, request, invitation, greeting, or other. Keep all replies natural and brief. A statement is not a question.`;

function extractMessageContent(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    throw new Error("MundusX returned an invalid response");
  }

  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error("MundusX response contains no choices");
  }

  const content = (choices[0] as { message?: { content?: unknown } })?.message?.content;
  if (typeof content !== "string" || content.trim().length === 0) {
    throw new Error("MundusX response contains no message content");
  }

  return content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}

export function parseStructuredResponse(content: string): ConversationResponse {
  const responseContent = content.includes("response=")
    ? content.slice(content.lastIndexOf("response=") + "response=".length)
    : content;
  const withoutFence = responseContent.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = withoutFence.indexOf("{");
  if (start < 0) {
    throw new Error("MundusX output contains no JSON object");
  }

  let depth = 0;
  let inString = false;
  let escaped = false;
  let end = -1;
  for (let index = start; index < withoutFence.length; index += 1) {
    const character = withoutFence[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{") depth += 1;
    else if (character === "}" && --depth === 0) {
      end = index;
      break;
    }
  }
  if (end < 0) {
    throw new Error("MundusX output contains incomplete JSON");
  }

  const json = withoutFence
    .slice(start, end + 1)
    .replace(/([,{]\s*)imeaning\s*:/g, '$1"meaning":')
    .replace(
      /("topic"\s*:\s*"(?:[^"\\]|\\.)*"\s*,)\s*[^"\s][^:]*:\s*("(?:[^"\\]|\\.)*")\s*,\s*("replies"\s*:)/s,
      '$1"meaning":$2,$3',
    );
  return conversationResponseSchema.parse(JSON.parse(json));
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export class MundusXAnalyzer implements ConversationAnalyzer {
  constructor(private readonly config: AppConfig) {}

  async analyze(input: ConversationRequest): Promise<ConversationResponse> {
    if (this.config.mundusxApiMode === "jobs") {
      return this.analyzeWithJobs(input);
    }
    return this.analyzeWithChat(input);
  }

  private async analyzeWithChat(input: ConversationRequest): Promise<ConversationResponse> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (this.config.mundusxApiKey) {
      headers.authorization = `Bearer ${this.config.mundusxApiKey}`;
    }

    const requestBody: Record<string, unknown> = {
      temperature: 0.35,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: JSON.stringify({
            transcript: input.transcript,
            conversationLanguage: input.conversationLanguage,
            userLanguage: input.userLanguage,
            recentTurns: input.recentTurns,
          }),
        },
      ],
    };
    if (this.config.mundusxModel) {
      requestBody.model = this.config.mundusxModel;
    }

    const response = await fetch(`${this.config.mundusxBaseUrl}/v1/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(this.config.mundusxTimeoutMs),
    });

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      throw new Error(`MundusX request failed (${response.status}): ${detail}`);
    }

    const content = extractMessageContent(await response.json());
    return parseStructuredResponse(content);
  }

  private async analyzeWithJobs(input: ConversationRequest): Promise<ConversationResponse> {
    const requestId = `speak-${crypto.randomUUID()}`;
    const history = input.recentTurns.length > 0
      ? ` Context: ${input.recentTurns.map((turn) => `${turn.speaker}: ${turn.text}`).join(" | ")}`
      : "";
    const prompt = `German utterance: ${input.transcript}.${history} Explain it in English and suggest the three required German replies.`;
    const deadline = Date.now() + this.config.mundusxTimeoutMs;
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.config.mundusxApiKey) {
      headers.authorization = `Bearer ${this.config.mundusxApiKey}`;
    }

    const submission = await fetch(`${this.config.mundusxBaseUrl}/v1/jobs`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        request_id: requestId,
        prompt,
        system_prompt: systemPrompt,
        preferred_backend: "auto",
        ...(this.config.mundusxModel ? { model: this.config.mundusxModel } : {}),
      }),
      signal: AbortSignal.timeout(this.config.mundusxTimeoutMs),
    });

    if (!submission.ok) {
      const detail = (await submission.text()).slice(0, 500);
      throw new Error(`MundusX job submission failed (${submission.status}): ${detail}`);
    }

    while (Date.now() < deadline) {
      await sleep(this.config.mundusxPollIntervalMs);
      const result = await fetch(`${this.config.mundusxBaseUrl}/v1/jobs/${encodeURIComponent(requestId)}`, {
        headers: this.config.mundusxApiKey
          ? { authorization: `Bearer ${this.config.mundusxApiKey}` }
          : undefined,
        signal: AbortSignal.timeout(Math.max(1_000, deadline - Date.now())),
      });
      if (!result.ok) {
        const detail = (await result.text()).slice(0, 500);
        throw new Error(`MundusX job polling failed (${result.status}): ${detail}`);
      }

      const payload = await result.json() as {
        status?: string;
        job?: { status?: string; output?: string | null; error?: string | null };
      };
      const status = payload.status ?? payload.job?.status;
      if (status === "failed") {
        throw new Error(`MundusX job failed: ${payload.job?.error ?? "unknown error"}`);
      }
      if (status === "completed") {
        const output = payload.job?.output;
        if (!output) {
          throw new Error("MundusX job completed without output");
        }
        return parseStructuredResponse(output);
      }
    }

    throw new Error(`MundusX job timed out after ${this.config.mundusxTimeoutMs} ms`);
  }
}

export class MockAnalyzer implements ConversationAnalyzer {
  async analyze(input: ConversationRequest): Promise<ConversationResponse> {
    const isQuestion = /[?？]$/.test(input.transcript.trim()) || /^(warum|wie|was|wer|wo|wann|kannst|könntest|hast|bist|ist)\b/i.test(input.transcript);

    return {
      speechAct: isQuestion ? "question" : "information",
      topic: "Conversation",
      meaning: input.transcript,
      replies: [
        {
          kind: "supportive",
          text: "Ja, das kann ich gut verstehen.",
          meaning: "Yes, I can understand that well.",
          purpose: "Acknowledge positively",
        },
        {
          kind: "continue",
          text: isQuestion ? "Was genau möchtest du darüber wissen?" : "Was ist dann passiert?",
          meaning: isQuestion ? "What exactly would you like to know about it?" : "What happened next?",
          purpose: "Continue the conversation",
        },
        {
          kind: "alternative",
          text: "Ich sehe das etwas anders.",
          meaning: "I see it a little differently.",
          purpose: "Offer another perspective",
        },
      ],
    };
  }
}
