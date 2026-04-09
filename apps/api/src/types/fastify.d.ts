import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Redis } from "@upstash/redis";
import type { readEnv } from "../config/env.js";

declare module "fastify" {
  interface FastifyInstance {
    env: ReturnType<typeof readEnv>;
    supabaseAnon: SupabaseClient;
    supabaseService: SupabaseClient;
    redis: Redis;
  }

  interface FastifyRequest {
    requestId: string;
    user: User | null;
    userRole: string | null;
  }
}

export {};
