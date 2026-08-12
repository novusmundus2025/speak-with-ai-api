import { describe, expect, it, vi } from "vitest";
import { buildApp } from "./app.js";
import type { AppConfig } from "./config.js";
import type { ConversationAnalyzer } from "./mundusx.js";

const config: AppConfig = {
  port: 8787,
  host: "127.0.0.1",
  allowedOrigins: ["http://localhost:5173"],
  useMockMundusx: true,
  mundusxBaseUrl: "https://mundusx.ai",
  mundusxApiMode: "jobs",
  mundusxApiKey: "",
  mundusxModel: "",
  mundusxTimeoutMs: 15_000,
  mundusxPollIntervalMs: 1_000,
};

describe("API", () => {
  it("reports health", async () => {
    const app = await buildApp({ config });
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok", provider: "mock" });
    await app.close();
  });

  it("analyzes a valid transcript", async () => {
    const analyze = vi.fn<ConversationAnalyzer["analyze"]>().mockResolvedValue({
      speechAct: "information",
      topic: "Weather",
      meaning: "The weather is pleasant.",
      replies: [
        { kind: "supportive", text: "Das finde ich auch.", meaning: "I think so too.", purpose: "Agree" },
        { kind: "continue", text: "Möchtest du spazieren gehen?", meaning: "Would you like to go for a walk?", purpose: "Continue" },
        { kind: "alternative", text: "Mir ist es etwas zu warm.", meaning: "It is a little too warm for me.", purpose: "Alternative" },
      ],
    });
    const app = await buildApp({ config, analyzer: { analyze } });
    const response = await app.inject({
      method: "POST",
      url: "/api/glasses/conversation",
      payload: { transcript: "Das Wetter ist heute schön." },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      detectedLanguage: "de",
      speechAct: "information",
      heard: "Das Wetter ist heute schön.",
      translation: "The weather is pleasant.",
      topic: "Weather",
      replies: [
        { kind: "supportive" },
        { kind: "continuation" },
        { kind: "alternative" },
      ],
    });
    expect(analyze).toHaveBeenCalledOnce();
    await app.close();
  });

  it("accepts the client priorTurns field and exposes credentialed CORS", async () => {
    const app = await buildApp({ config });
    const preflight = await app.inject({
      method: "OPTIONS",
      url: "/api/glasses/conversation",
      headers: {
        origin: "http://localhost:5173",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type",
      },
    });

    expect(preflight.statusCode).toBe(204);
    expect(preflight.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(preflight.headers["access-control-allow-credentials"]).toBe("true");
    await app.close();
  });

  it("rejects an empty transcript", async () => {
    const app = await buildApp({ config });
    const response = await app.inject({
      method: "POST",
      url: "/api/glasses/conversation",
      payload: { transcript: "" },
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });
});
