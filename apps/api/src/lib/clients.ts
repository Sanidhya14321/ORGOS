import net from "node:net";
import tls from "node:tls";
import { createClient } from "@supabase/supabase-js";
import { Redis } from "@upstash/redis";
import { Redis as RedisClient } from "ioredis";
import type { Env } from "../config/env.js";

type RedisValue = string | null;

export type RedisSetOptions = {
  ex?: number;
};

export type RedisScanResult = [cursor: string, keys: string[]];

export interface AppRedisClient {
  mode: "remote" | "memory";
  ping(): Promise<string>;
  get(key: string): Promise<RedisValue>;
  set(key: string, value: string, options?: RedisSetOptions): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
  keys(pattern: string): Promise<string[]>;
  scan(
    cursor: string,
    matchKeyword?: "MATCH",
    pattern?: string,
    countKeyword?: "COUNT",
    count?: number
  ): Promise<RedisScanResult>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  close(): Promise<void>;
}

function globToRegExp(pattern: string): RegExp {
  const escapedPattern = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escapedPattern.replace(/\\\*/g, ".*")}$`);
}

function createInMemoryRedisClient(): AppRedisClient {
  const store = new Map<string, { value: string; expiresAt: number | null }>();

  const purgeExpiredKey = (key: string) => {
    const entry = store.get(key);
    if (!entry || entry.expiresAt === null || entry.expiresAt > Date.now()) {
      return;
    }
    store.delete(key);
  };

  const purgeExpiredKeys = () => {
    for (const key of store.keys()) {
      purgeExpiredKey(key);
    }
  };

  return {
    mode: "memory",
    async ping() {
      return "PONG";
    },
    async get(key) {
      purgeExpiredKey(key);
      return store.get(key)?.value ?? null;
    },
    async set(key, value, options) {
      const expiresAt = typeof options?.ex === "number"
        ? Date.now() + options.ex * 1000
        : null;
      store.set(key, { value, expiresAt });
      return "OK";
    },
    async del(...keys) {
      let deleted = 0;
      for (const key of keys) {
        purgeExpiredKey(key);
        if (store.delete(key)) {
          deleted += 1;
        }
      }
      return deleted;
    },
    async keys(pattern) {
      purgeExpiredKeys();
      const matcher = globToRegExp(pattern);
      return [...store.keys()].filter((key) => matcher.test(key));
    },
    async scan(cursor, _matchKeyword = "MATCH", pattern = "*", _countKeyword = "COUNT", count = 100) {
      purgeExpiredKeys();
      const matcher = globToRegExp(pattern);
      const allKeys = [...store.keys()].filter((key) => matcher.test(key));
      const start = Number.parseInt(cursor, 10) || 0;
      const end = Math.min(start + count, allKeys.length);
      const nextCursor = end >= allKeys.length ? "0" : String(end);
      return [nextCursor, allKeys.slice(start, end)];
    },
    async incr(key) {
      purgeExpiredKey(key);
      const current = Number.parseInt(store.get(key)?.value ?? "0", 10);
      const next = current + 1;
      const expiresAt = store.get(key)?.expiresAt ?? null;
      store.set(key, { value: String(next), expiresAt });
      return next;
    },
    async expire(key, seconds) {
      purgeExpiredKey(key);
      const existing = store.get(key);
      if (!existing) {
        return 0;
      }
      store.set(key, { ...existing, expiresAt: Date.now() + seconds * 1000 });
      return 1;
    },
    async close() {
      store.clear();
    }
  };
}

function createRemoteRedisAdapter(client: RedisClient | Redis): AppRedisClient {
  const rawClient = client as any;

  return {
    mode: "remote",
    async ping() {
      return String(await rawClient.ping());
    },
    async get(key) {
      const value = await rawClient.get(key);
      return value == null ? null : String(value);
    },
    async set(key, value, options) {
      if (typeof options?.ex === "number") {
        if (rawClient instanceof RedisClient) {
          return rawClient.set(key, value, "EX", options.ex);
        }
        return rawClient.set(key, value, { ex: options.ex });
      }
      return rawClient.set(key, value);
    },
    async del(...keys) {
      if (keys.length === 0) {
        return 0;
      }
      return Number(await rawClient.del(...keys));
    },
    async keys(pattern) {
      const keys = await rawClient.keys(pattern);
      return Array.isArray(keys) ? keys.map((key) => String(key)) : [];
    },
    async scan(cursor, matchKeyword = "MATCH", pattern = "*", countKeyword = "COUNT", count = 100) {
      const result = await rawClient.scan(cursor, matchKeyword, pattern, countKeyword, count);
      if (Array.isArray(result) && result.length === 2) {
        return [String(result[0]), Array.isArray(result[1]) ? result[1].map((key: unknown) => String(key)) : []];
      }
      return ["0", []];
    },
    async incr(key) {
      return Number(await rawClient.incr(key));
    },
    async expire(key, seconds) {
      return Number(await rawClient.expire(key, seconds));
    },
    async close() {
      if (typeof rawClient.quit === "function") {
        await rawClient.quit();
        return;
      }
      if (typeof rawClient.disconnect === "function") {
        rawClient.disconnect();
      }
    }
  };
}

export async function canReachRedisUrl(redisUrlRaw: string): Promise<boolean> {
  try {
    const redisUrl = new URL(redisUrlRaw);
    const isRediss = redisUrl.protocol === "rediss:";
    const isHttpsRest = redisUrl.protocol === "https:";
    const port = redisUrl.port ? Number(redisUrl.port) : 6379;

    await new Promise<void>((resolve, reject) => {
      const socket = isRediss || isHttpsRest
        ? tls.connect({ host: redisUrl.hostname, port })
        : net.createConnection({ host: redisUrl.hostname, port });

      const onError = (error: Error) => {
        socket.destroy();
        reject(error);
      };

      socket.setTimeout(1200, () => {
        socket.destroy();
        reject(new Error("Redis preflight timeout"));
      });

      socket.once("error", onError);
      socket.once("connect", () => {
        socket.end();
        resolve();
      });
    });

    return true;
  } catch {
    return false;
  }
}

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

export async function createRedisClient(
  env: Env,
  options: { allowMemoryFallback?: boolean } = {}
): Promise<AppRedisClient> {
  if (options.allowMemoryFallback && !(await canReachRedisUrl(env.UPSTASH_REDIS_URL))) {
    return createInMemoryRedisClient();
  }

  const redisUrl = new URL(env.UPSTASH_REDIS_URL);

  if (redisUrl.protocol === "redis:" || redisUrl.protocol === "rediss:") {
    const client = new RedisClient({
      host: redisUrl.hostname,
      port: redisUrl.port ? Number(redisUrl.port) : 6379,
      username: redisUrl.username || "default",
      password: env.UPSTASH_REDIS_TOKEN,
      tls: redisUrl.protocol === "rediss:" ? {} : undefined,
      lazyConnect: false,
      maxRetriesPerRequest: null
    });

    // Avoid ioredis surfacing connection failures as unhandled process-level events.
    client.on("error", () => {});

    return createRemoteRedisAdapter(client);
  }

  return createRemoteRedisAdapter(new Redis({
    url: env.UPSTASH_REDIS_URL,
    token: env.UPSTASH_REDIS_TOKEN
  }));
}
