import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";

export const ROUTING_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;

function normalizeKeywords(values: string[]): string[] {
  return values
    .flatMap((value) => value.toLowerCase().split(/[^a-z0-9]+/))
    .map((token) => token.trim())
    .filter((token) => token.length >= 3)
    .sort();
}

export function buildRoutingCacheKey(input: {
  orgId: string;
  taskKeywords: string[];
  deptNames: string[];
}): string {
  const hash = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        orgId: input.orgId,
        taskKeywords: normalizeKeywords(input.taskKeywords),
        deptNames: [...new Set(input.deptNames.map((name) => name.toLowerCase().trim()))].sort()
      })
    )
    .digest("hex");

  return `cache:${input.orgId}:${hash}`;
}

export async function getRoutingPromptCache<T>(fastify: FastifyInstance, cacheKey: string): Promise<T | null> {
  const redisGet = fastify.redis?.get?.bind(fastify.redis) as
    | ((key: string) => Promise<unknown>)
    | undefined;

  if (!redisGet) {
    return null;
  }

  const raw = await redisGet(cacheKey);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(String(raw)) as T;
  } catch {
    return null;
  }
}

export async function setRoutingPromptCache(
  fastify: FastifyInstance,
  cacheKey: string,
  payload: unknown
): Promise<void> {
  const redisSet = fastify.redis?.set?.bind(fastify.redis) as
    | ((key: string, value: string, options: { ex: number }) => Promise<unknown>)
    | undefined;

  if (!redisSet) {
    return;
  }

  await redisSet(cacheKey, JSON.stringify(payload), {
    ex: ROUTING_CACHE_TTL_SECONDS
  });
}

export async function invalidateOrgPromptCache(fastify: FastifyInstance, orgId: string): Promise<void> {
  // Prefer scan-based deletion to avoid blocking Redis (avoid KEYS).
  // Support multiple redis client APIs (ioredis, upstash-compatible, node-redis).
  const redis = (fastify.redis as any) || null;
  if (!redis) return;

  const pattern = `cache:${orgId}:*`;

  // If the client exposes scan (ioredis / node-redis), use it.
  const hasScan = typeof redis.scan === "function";
  const hasDel = typeof redis.del === "function";

  if (!hasDel) return;

  try {
    if (hasScan) {
      // Iterate with SCAN cursor and delete in batches
      let cursor = '0';
      const batchSize = 100;
      do {
        // redis.scan returns [cursor, keys]
        // Some clients (ioredis) return an array of strings
        const res = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', batchSize);
        if (!res) break;

        // Normalize for different client shapes
        let nextCursor = '0';
        let keys: string[] = [];
        if (Array.isArray(res) && res.length === 2) {
          nextCursor = String(res[0]);
          keys = Array.isArray(res[1]) ? res[1] : [];
        } else if (Array.isArray(res)) {
          // Fallback: assume flat list (rare)
          keys = res as string[];
        }

        if (keys.length > 0) {
          // delete in a single call when supported
          await redis.del(...keys);
        }

        cursor = nextCursor;
      } while (cursor !== '0');

      return;
    }

    // Fallback: some clients provide keys but not scan (e.g., some wrappers). Use KEYS only if available
    if (typeof redis.keys === 'function') {
      const keys = await redis.keys(pattern);
      if (keys && keys.length > 0) {
        await Promise.all(keys.map((k: string) => redis.del(k)));
      }
    }
  } catch (err) {
    // Do not throw from cache invalidation; log and continue
    try {
      fastify.log?.warn({ err, orgId }, 'invalidateOrgPromptCache failed');
    } catch {
      // ignore logging errors
    }
  }
}
