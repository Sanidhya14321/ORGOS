import type { LLMProvider, LLMMessage, LLMOptions, LLMResponse } from "./provider.js";
import { llmMetrics } from "./metrics.js";

type CircuitState = {
  failures: number;
  openedUntil: number | null;
};

const circuitStates: Map<string, CircuitState> = new Map();

// Optional metrics emitter for resiliency events. Tests or hosting apps can register.
let metricsEmitter: ((event: string, labels?: Record<string, string | number>) => void) | null = null;

export function setMetricsEmitter(fn: (event: string, labels?: Record<string, string | number>) => void) {
  metricsEmitter = fn;
}

export interface ResiliencyConfig {
  timeoutMs?: number;
  retries?: number;
  failureThreshold?: number;
  cooldownMs?: number;
  backoffBaseMs?: number;
}

const DEFAULTS: Required<ResiliencyConfig> = {
  timeoutMs: 8000,
  retries: 1,
  failureThreshold: 3,
  cooldownMs: 60000,
  backoffBaseMs: 300
};

function now() {
  return Date.now();
}

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

function isCircuitOpen(name: string): boolean {
  const state = circuitStates.get(name);
  if (!state) return false;
  if (state.openedUntil && state.openedUntil > now()) return true;
  return false;
}

function recordFailure(name: string, cfg: Required<ResiliencyConfig>) {
  const state = circuitStates.get(name) ?? { failures: 0, openedUntil: null };
  state.failures += 1;
  if (state.failures >= cfg.failureThreshold) {
    state.openedUntil = now() + cfg.cooldownMs;
    state.failures = 0;
    // emit circuit open metric
    try {
      metricsEmitter?.('resiliency.circuit_open', { provider: name });
      llmMetrics.recordCircuitOpen(name);
    } catch {}
  }
  circuitStates.set(name, state);
  try {
    metricsEmitter?.('resiliency.failure', { provider: name, failures: state.failures });
    llmMetrics.recordFailure(name);
  } catch {}
}

function recordSuccess(name: string) {
  circuitStates.set(name, { failures: 0, openedUntil: null });
  try {
    metricsEmitter?.('resiliency.success', { provider: name });
    llmMetrics.recordSuccess(name);
  } catch {}
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | null = null;
  const timeout = new Promise<never>((_res, rej) => {
    timer = setTimeout(() => rej(new Error(`operation timed out after ${ms}ms`)), ms);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function resilientComplete(
  provider: LLMProvider,
  messages: LLMMessage[],
  opts?: LLMOptions,
  config?: ResiliencyConfig
): Promise<LLMResponse> {
  const cfg: Required<ResiliencyConfig> = { ...DEFAULTS, ...(config ?? {}) } as Required<ResiliencyConfig>;
  const name = provider.name ?? "provider";

  if (isCircuitOpen(name)) {
    throw new Error(`circuit open for provider ${name}`);
  }

  let lastError: unknown = null;
  for (let attempt = 0; attempt <= cfg.retries; attempt++) {
    try {
      const result = await withTimeout(provider.complete(messages, opts), cfg.timeoutMs);
      recordSuccess(name);
      return result;
    } catch (err) {
      lastError = err;
      recordFailure(name, cfg);
      const backoff = cfg.backoffBaseMs * Math.pow(2, attempt);
      // add jitter
      const jitter = Math.floor(Math.random() * Math.min(300, backoff));
      await sleep(backoff + jitter);
    }
  }

  throw lastError;
}
