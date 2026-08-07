import { z } from "zod";

export const speechActSchema = z.enum([
  "question",
  "opinion",
  "information",
  "request",
  "invitation",
  "greeting",
  "other",
]);

export const conversationRequestSchema = z.object({
  transcript: z.string().trim().min(1).max(4_000),
  conversationLanguage: z.string().trim().min(2).max(35).default("de"),
  userLanguage: z.string().trim().min(2).max(35).default("en"),
  recentTurns: z
    .array(
      z.object({
        speaker: z.enum(["other", "user"]),
        text: z.string().trim().min(1).max(1_000),
      }),
    )
    .max(6)
    .default([]),
});

export const replySchema = z.object({
  kind: z.enum(["supportive", "continue", "alternative"]),
  text: z.string().trim().min(1).max(280),
  meaning: z.string().trim().min(1).max(280),
  purpose: z.string().trim().min(1).max(120),
});

export const conversationResponseSchema = z.object({
  speechAct: speechActSchema,
  topic: z.string().trim().min(1).max(120),
  meaning: z.string().trim().min(1).max(500),
  replies: z.array(replySchema).length(3).superRefine((replies, context) => {
    const kinds = new Set(replies.map((reply) => reply.kind));
    for (const kind of ["supportive", "continue", "alternative"] as const) {
      if (!kinds.has(kind)) {
        context.addIssue({
          code: "custom",
          message: `Missing ${kind} reply`,
        });
      }
    }
  }),
});

export type ConversationRequest = z.infer<typeof conversationRequestSchema>;
export type ConversationResponse = z.infer<typeof conversationResponseSchema>;
