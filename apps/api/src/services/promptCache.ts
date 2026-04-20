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
  const redisKeys = fastify.redis?.keys?.bind(fastify.redis) as
    | ((pattern: string) => Promise<string[] | null>)
    | undefined;
  const redisDel = fastify.redis?.del?.bind(fastify.redis) as
    | ((key: string) => Promise<unknown>)
    | undefined;

  if (!redisKeys || !redisDel) {
    return;
  }

  try {
    const keys = await redisKeys(`cache:${orgId}:*`);
    if (!keys || keys.length === 0) {
      return;
    }

    await Promise.all(keys.map(async (key) => redisDel(key)));
  } catch {
    return;
  }
}
