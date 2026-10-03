import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_API_URL: z.string().url().default("http://localhost:8000"),
  // "mock": fixtures demo explícitos en memoria. "live": API real del backend.
  NEXT_PUBLIC_API_MODE: z.enum(["mock", "live"]).default("mock"),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  return envSchema.parse({
    NEXT_PUBLIC_API_URL: source.NEXT_PUBLIC_API_URL || undefined,
    NEXT_PUBLIC_API_MODE: source.NEXT_PUBLIC_API_MODE || undefined,
  });
}

export const env = parseEnv({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_API_MODE: process.env.NEXT_PUBLIC_API_MODE,
});
