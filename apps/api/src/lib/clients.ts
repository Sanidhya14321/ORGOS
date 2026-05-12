import { createClient } from "@supabase/supabase-js";
import { Redis } from "@upstash/redis";
import { Redis as RedisClient } from "ioredis";
import type { Env } from "../config/env.js";

export function createSupabaseAnonClient(env: Env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
}

export function createSupabaseServiceClient(env: Env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
}

export function createRedisClient(env: Env) {
  const redisUrl = new URL(env.UPSTASH_REDIS_URL);

  if (redisUrl.protocol === "redis:" || redisUrl.protocol === "rediss:") {
    return new RedisClient({
      host: redisUrl.hostname,
      port: redisUrl.port ? Number(redisUrl.port) : 6379,
      username: redisUrl.username || "default",
      password: env.UPSTASH_REDIS_TOKEN,
      tls: redisUrl.protocol === "rediss:" ? {} : undefined,
      lazyConnect: false,
      maxRetriesPerRequest: null
    }) as unknown as Redis;
  }

  return new Redis({
    url: env.UPSTASH_REDIS_URL,
    token: env.UPSTASH_REDIS_TOKEN
  });
}
