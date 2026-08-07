import Fastify from "fastify";
import cors from "@fastify/cors";
import type { AppConfig } from "./config.js";
import { MockAnalyzer, MundusXAnalyzer, type ConversationAnalyzer } from "./mundusx.js";
import { conversationRequestSchema } from "./schemas.js";

export interface BuildAppOptions {
  config: AppConfig;
  analyzer?: ConversationAnalyzer;
}

export async function buildApp({ config, analyzer }: BuildAppOptions) {
  const app = Fastify({ logger: process.env.NODE_ENV !== "test" });
  const conversationAnalyzer = analyzer ?? (config.useMockMundusx ? new MockAnalyzer() : new MundusXAnalyzer(config));

  await app.register(cors, {
    origin(origin, callback) {
      if (!origin || config.allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Origin is not allowed"), false);
    },
    methods: ["GET", "POST", "OPTIONS"],
  });

  app.get("/health", async () => ({
    status: "ok",
    provider: config.useMockMundusx ? "mock" : "mundusx",
  }));

  app.post("/api/glasses/conversation", async (request, reply) => {
    const parsed = conversationRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid request",
        issues: parsed.error.issues,
      });
    }

    try {
      return await conversationAnalyzer.analyze(parsed.data);
    } catch (error) {
      request.log.error({ error }, "Conversation analysis failed");
      return reply.code(502).send({
        error: "Conversation analysis failed",
      });
    }
  });

  return app;
}
