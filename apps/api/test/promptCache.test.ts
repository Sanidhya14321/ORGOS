import { vi, describe, it, expect, beforeEach } from 'vitest';

import type { FastifyInstance } from 'fastify';
// import the function under test
import { invalidateOrgPromptCache } from '../src/services/promptCache';

describe('invalidateOrgPromptCache', () => {
  let fastify: Partial<FastifyInstance> & { redis?: any; log?: any };

  beforeEach(() => {
    fastify = { log: { warn: vi.fn() } };
  });

  it('uses scan when available and deletes keys in batches', async () => {
    const deleted: string[] = [];
    // mock redis.scan to return two pages
    const mockRedis = {
      scan: vi.fn()
        .mockResolvedValueOnce(['1', ['cache:org1:key1', 'cache:org1:key2']])
        .mockResolvedValueOnce(['0', ['cache:org1:key3']]),
      del: vi.fn(async (...keys: string[]) => {
        deleted.push(...keys);
        return keys.length;
      })
    };

    fastify.redis = mockRedis;

    await invalidateOrgPromptCache(fastify as FastifyInstance, 'org1');

    expect(mockRedis.scan).toHaveBeenCalled();
    expect(deleted).toEqual(expect.arrayContaining(['cache:org1:key1', 'cache:org1:key2', 'cache:org1:key3']));
  });

  it('falls back to keys when scan not available', async () => {
    const deleted: string[] = [];
    const mockRedis = {
      keys: vi.fn().mockResolvedValue(['cache:org2:a', 'cache:org2:b']),
      del: vi.fn(async (k: string) => { deleted.push(k); return 1; })
    };

    fastify.redis = mockRedis;

    await invalidateOrgPromptCache(fastify as FastifyInstance, 'org2');

    expect(mockRedis.keys).toHaveBeenCalled();
    expect(deleted).toEqual(['cache:org2:a', 'cache:org2:b']);
  });

  it('no-ops when redis not present', async () => {
    await invalidateOrgPromptCache(fastify as FastifyInstance, 'orgX');
    expect((fastify.log!.warn as any).mock.calls.length).toBe(0);
  });
});
