import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { resilientComplete, setMetricsEmitter } from '../src/llm/resiliency';
import type { LLMProvider, LLMMessage } from '../src/llm/provider';

describe('resiliency resilientComplete', () => {
  let metrics: Array<{ event: string; labels?: any }> = [];

  beforeEach(() => {
    metrics = [];
    setMetricsEmitter((event, labels) => metrics.push({ event, labels }));
  });

  afterEach(() => {
    // reset emitter
    setMetricsEmitter(() => {});
  });

  it('records failure and opens circuit when provider returns rate-limit error', async () => {
    const provider: LLMProvider = {
      name: 'mock-rate-limit',
      complete: async () => {
        const err: any = new Error('429 Too Many Requests');
        err.code = '429';
        throw err;
      }
    };

    await expect(
      resilientComplete(provider, [] as LLMMessage[], undefined, { retries: 0, failureThreshold: 1, timeoutMs: 50, cooldownMs: 1000, backoffBaseMs: 1 })
    ).rejects.toThrow();

    // Expect metrics for failure and circuit_open
    expect(metrics.some(m => m.event === 'resiliency.failure')).toBe(true);
    expect(metrics.some(m => m.event === 'resiliency.circuit_open')).toBe(true);
  });

  it('times out and records failure', async () => {
    const provider: LLMProvider = {
      name: 'mock-timeout',
      complete: () => new Promise(() => {}) // never resolves
    };

    await expect(
      resilientComplete(provider, [] as LLMMessage[], undefined, { retries: 0, failureThreshold: 1, timeoutMs: 10, cooldownMs: 1000, backoffBaseMs: 1 })
    ).rejects.toThrow(/timed out/);

    expect(metrics.some(m => m.event === 'resiliency.failure')).toBe(true);
  });

  it('records success metric on success', async () => {
    const provider: LLMProvider = {
      name: 'mock-success',
      complete: async () => ({ content: 'ok', promptTokens: 1, compTokens: 2, latencyMs: 5 })
    };

    const res = await resilientComplete(provider, [] as LLMMessage[], undefined, { retries: 0, failureThreshold: 3, timeoutMs: 100, cooldownMs: 1000, backoffBaseMs: 1 });
    expect(res.content).toBe('ok');
    expect(metrics.some(m => m.event === 'resiliency.success')).toBe(true);
  });
});
