import * as path from "path";
import * as _dotenv from "dotenv";
import { fileURLToPath } from "url";
import { z } from "zod";

// Load .env.local from monorepo root
// __dirname would be /app/api/src, so we go up 3 levels toimport.meta.url
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.resolve(__dirname, "../../..");

_dotenv.config({ path: path.join(monorepoRoot, ".env.local") });

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  UPSTASH_REDIS_URL: z.string().url(),
  UPSTASH_REDIS_TOKEN: z.string().min(1)
});

export type Env = z.infer<typeof EnvSchema>;

export function readEnv(): Env {
  return EnvSchema.parse(process.env);
}
