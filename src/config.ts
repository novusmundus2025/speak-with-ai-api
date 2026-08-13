import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ path: [".env.local", ".env"], quiet: true });

const booleanFromString = z
  .enum(["true", "false"])
  .default("true")
  .transform((value) => value === "true");

const environmentSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65_535).default(8787),
  HOST: z.string().default("127.0.0.1"),
  ALLOWED_ORIGINS: z.string().default("http://localhost:5173,http://127.0.0.1:5173"),
  USE_MOCK_MUNDUSX: booleanFromString,
  MUNDUSX_BASE_URL: z.string().url().default("https://mundusx.ai"),
  MUNDUSX_API_MODE: z.enum(["speakai", "jobs", "chat"]).default("speakai"),
  MUNDUSX_API_KEY: z.string().default(""),
  MUNDUSX_MODEL: z.string().default(""),
  MUNDUSX_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(15_000),
  MUNDUSX_POLL_INTERVAL_MS: z.coerce.number().int().min(250).max(10_000).default(1_000),
});

export interface AppConfig {
  port: number;
  host: string;
  allowedOrigins: string[];
  useMockMundusx: boolean;
  mundusxBaseUrl: string;
  mundusxApiMode: "speakai" | "jobs" | "chat";
  mundusxApiKey: string;
  mundusxModel: string;
  mundusxTimeoutMs: number;
  mundusxPollIntervalMs: number;
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = environmentSchema.parse(environment);

  return {
    port: parsed.PORT,
    host: parsed.HOST,
    allowedOrigins: parsed.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean),
    useMockMundusx: parsed.USE_MOCK_MUNDUSX,
    mundusxBaseUrl: parsed.MUNDUSX_BASE_URL.replace(/\/$/, ""),
    mundusxApiMode: parsed.MUNDUSX_API_MODE,
    mundusxApiKey: parsed.MUNDUSX_API_KEY,
    mundusxModel: parsed.MUNDUSX_MODEL,
    mundusxTimeoutMs: parsed.MUNDUSX_TIMEOUT_MS,
    mundusxPollIntervalMs: parsed.MUNDUSX_POLL_INTERVAL_MS,
  };
}
