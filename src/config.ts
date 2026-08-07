import "dotenv/config";
import { z } from "zod";

const booleanFromString = z
  .enum(["true", "false"])
  .default("true")
  .transform((value) => value === "true");

const environmentSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65_535).default(8787),
  HOST: z.string().default("127.0.0.1"),
  ALLOWED_ORIGINS: z.string().default("http://localhost:5173,http://127.0.0.1:5173"),
  USE_MOCK_MUNDUSX: booleanFromString,
  MUNDUSX_BASE_URL: z.string().url().default("https://mundusx.ai/v1"),
  MUNDUSX_API_KEY: z.string().default(""),
  MUNDUSX_MODEL: z.string().default(""),
  MUNDUSX_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(15_000),
});

export interface AppConfig {
  port: number;
  host: string;
  allowedOrigins: string[];
  useMockMundusx: boolean;
  mundusxBaseUrl: string;
  mundusxApiKey: string;
  mundusxModel: string;
  mundusxTimeoutMs: number;
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = environmentSchema.parse(environment);

  if (!parsed.USE_MOCK_MUNDUSX && (!parsed.MUNDUSX_API_KEY || !parsed.MUNDUSX_MODEL)) {
    throw new Error("MUNDUSX_API_KEY and MUNDUSX_MODEL are required when USE_MOCK_MUNDUSX=false");
  }

  return {
    port: parsed.PORT,
    host: parsed.HOST,
    allowedOrigins: parsed.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean),
    useMockMundusx: parsed.USE_MOCK_MUNDUSX,
    mundusxBaseUrl: parsed.MUNDUSX_BASE_URL.replace(/\/$/, ""),
    mundusxApiKey: parsed.MUNDUSX_API_KEY,
    mundusxModel: parsed.MUNDUSX_MODEL,
    mundusxTimeoutMs: parsed.MUNDUSX_TIMEOUT_MS,
  };
}
