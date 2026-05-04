// Minimal Prometheus-based metrics adapter for LLM resiliency and router events.
// If prom-client is available, uses actual counters; otherwise logs to console.

let isPrometheusAvailable = false;
let Counter: any = null;
let Histogram: any = null;

try {
  const prom = await import('prom-client');
  isPrometheusAvailable = true;
  Counter = prom.Counter;
  Histogram = prom.Histogram;
} catch {
  // prom-client not available, fallback to no-op
}

const counters = new Map<string, any>();
const histograms = new Map<string, any>();

function getOrCreateCounter(name: string, help: string, labelNames: string[] = []) {
  if (!isPrometheusAvailable) return null;
  if (!counters.has(name)) {
    counters.set(name, new Counter({ name, help, labelNames }));
  }
  return counters.get(name);
}

function getOrCreateHistogram(name: string, help: string, labelNames: string[] = [], buckets: number[] = []) {
  if (!isPrometheusAvailable) return null;
  if (!histograms.has(name)) {
    histograms.set(name, new Histogram({ name, help, labelNames, buckets }));
  }
  return histograms.get(name);
}

export const llmMetrics = {
  // Resiliency metrics
  recordFailure: (provider: string) => {
    const counter = getOrCreateCounter('llm_provider_failures_total', 'Total LLM provider failures', ['provider']);
    counter?.labels(provider).inc();
  },

  recordCircuitOpen: (provider: string) => {
    const counter = getOrCreateCounter('llm_circuit_open_total', 'Total circuit breaker opens', ['provider']);
    counter?.labels(provider).inc();
  },

  recordSuccess: (provider: string) => {
    const counter = getOrCreateCounter('llm_provider_successes_total', 'Total LLM provider successes', ['provider']);
    counter?.labels(provider).inc();
  },

  // Router metrics
  recordRouterFallback: (fromProvider: string, toProvider: string) => {
    const counter = getOrCreateCounter('llm_router_fallbacks_total', 'Total provider fallbacks', ['from', 'to']);
    counter?.labels(fromProvider, toProvider).inc();
  },

  recordRouterLatency: (provider: string, latencyMs: number) => {
    const hist = getOrCreateHistogram('llm_router_latency_ms', 'LLM router request latency', ['provider'], [10, 100, 500, 1000, 3000, 8000]);
    hist?.labels(provider).observe(latencyMs);
  },

  recordAllProvidersExhausted: () => {
    const counter = getOrCreateCounter('llm_all_providers_exhausted_total', 'All providers exhausted', []);
    counter?.inc();
  }
};
