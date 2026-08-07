import {
  conversationResponseSchema,
  type ConversationRequest,
  type ConversationResponse,
} from "./schemas.js";
import type { AppConfig } from "./config.js";

export interface ConversationAnalyzer {
  analyze(input: ConversationRequest): Promise<ConversationResponse>;
}

const systemPrompt = `You power a conversational assistant on smart glasses.
Analyze what the other person said; they may be making a statement rather than asking a question.
Return JSON only, with exactly this structure:
{
  "speechAct": "question|opinion|information|request|invitation|greeting|other",
  "topic": "very short topic in the user's language",
  "meaning": "concise meaning in the user's language",
  "replies": [
    {"kind":"supportive","text":"...","meaning":"...","purpose":"..."},
    {"kind":"continue","text":"...","meaning":"...","purpose":"..."},
    {"kind":"alternative","text":"...","meaning":"...","purpose":"..."}
  ]
}
The reply text must be in the conversation language. Meaning, topic, and purpose must be in the user's language.
Replies must be natural, short enough for a glasses HUD, relevant to the speech act, and must not pretend a statement was a question.`;

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

export class MundusXAnalyzer implements ConversationAnalyzer {
  constructor(private readonly config: AppConfig) {}

  async analyze(input: ConversationRequest): Promise<ConversationResponse> {
    const response = await fetch(`${this.config.mundusxBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.config.mundusxApiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.config.mundusxModel,
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
      }),
      signal: AbortSignal.timeout(this.config.mundusxTimeoutMs),
    });

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      throw new Error(`MundusX request failed (${response.status}): ${detail}`);
    }

    const content = extractMessageContent(await response.json());
    return conversationResponseSchema.parse(JSON.parse(content));
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
