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
