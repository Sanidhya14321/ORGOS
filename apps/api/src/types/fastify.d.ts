import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { readEnv } from "../config/env.js";
import type { AppRedisClient } from "../lib/clients.js";

declare module "fastify" {
  interface FastifyInstance {
    env: ReturnType<typeof readEnv>;
    supabaseAnon: SupabaseClient;
    supabaseService: SupabaseClient;
    redis: AppRedisClient;
  }

  interface FastifyRequest {
    requestId: string;
    user: User | null;
    userRole: string | null;
    userOrgId: string | null;
    assertOrgAccess?: (targetOrgId: string | null | undefined) => Promise<unknown>;
  }
}

export {};
