import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
  RELAX_SECURITY_FOR_LOCAL_TESTING: z.coerce.boolean().default(false),
  AUTH_COOKIE_SIGNING_SECRET: z.string().min(32).optional(),
  SLA_MONITOR_ENABLED: z.coerce.boolean().default(true),
  SLA_CHECK_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
  SLA_AT_RISK_WINDOW_MINUTES: z.coerce.number().int().positive().default(120),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  UPSTASH_REDIS_URL: z.string().url(),
  UPSTASH_REDIS_TOKEN: z.string().min(1),
  GROQ_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  /** Optional; document embedding ingest + vector/hybrid retrieval need this at runtime. */
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_EMBEDDING_MODEL: z.string().optional(),
  /** Qdrant REST base URL, e.g. http://localhost:6333 — when set, chunk vectors use Qdrant instead of Postgres `embeddings`. */
  QDRANT_URL: z.string().optional(),
  QDRANT_API_KEY: z.string().optional(),
  QDRANT_COLLECTION: z.string().optional(),
  /** Must match embedding model output size (OpenAI text-embedding-3-small default 1536). */
  EMBEDDING_VECTOR_SIZE: z.coerce.number().int().positive().optional(),
  /** Set to `1` to merge vector + lexical hybrid hits with reciprocal rank fusion (`ragSearchClient`). */
  ORGOS_RAG_MERGE_RRF: z
    .string()
    .optional()
    .transform((value) => value === "1"),
  /** When true, CEO stage uses `ceoAgent` only (single-call style eval); default keeps hierarchical agent. */
  ORGOS_CEO_DECOMPOSE_SINGLE_CALL: z.coerce.boolean().default(false),
  SENTRY_DSN: z.string().optional(),
  DATADOG_API_KEY: z.string().optional(),
  DATADOG_ENABLED: z.coerce.boolean().default(false)
});

export type Env = z.infer<typeof EnvSchema>;

export function readEnv(): Env {
  return EnvSchema.parse(process.env);
}

export function isLocalDevelopmentEnv(env: Env): boolean {
  if (env.NODE_ENV === "production") {
    return false;
  }

  try {
    const hostname = new URL(env.WEB_ORIGIN).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0";
  } catch {
    return false;
  }
}

export function shouldRelaxSecurityForLocalTesting(env: Env): boolean {
  if (env.NODE_ENV === "production") {
    return false;
  }

  return env.RELAX_SECURITY_FOR_LOCAL_TESTING || isLocalDevelopmentEnv(env);
}
