import type { Counter, Histogram, Registry } from "prom-client";
import type { Env } from "../config/env.js";

let register: Registry | null = null;

// Metrics registry (lazily initialized)
function getRegistry(): Registry | null {
  if (register) return register;

  try {
    const { register: promRegister } = await import("prom-client");
    register = promRegister;
    return register;
  } catch {
    return null;
  }
}

/**
 * Initialize Prometheus metrics
 * Must be called before any metrics are recorded
 */
export async function initializePrometheus(): Promise<void> {
  const reg = await getRegistry();
  if (!reg) {
    console.log("[prometheus] prom-client not available, metrics disabled");
  } else {
    console.log("[prometheus] Metrics initialized");
  }
}

/**
 * Get Prometheus metrics registry
 * Can be used by hosting platforms (Grafana, Datadog, etc.)
 */
export async function getMetricsRegistry(): Promise<Registry | null> {
  return getRegistry();
}

/**
 * Export metrics in Prometheus text format
 */
export async function getMetricsText(): Promise<string> {
  const reg = await getRegistry();
  if (!reg) return "";
  return reg.metrics();
}

/**
 * Wrapper for prom-client Counter with optional initialization
 */
export async function createCounter(
  name: string,
  help: string,
  labelNames?: string[]
): Promise<Counter<string> | null> {
  const reg = await getRegistry();
  if (!reg) return null;

  try {
    const { Counter } = await import("prom-client");
    return new Counter({ name, help, labelNames, registers: [reg] });
  } catch {
    return null;
  }
}

/**
 * Wrapper for prom-client Histogram with optional initialization
 */
export async function createHistogram(
  name: string,
  help: string,
  buckets?: number[],
  labelNames?: string[]
): Promise<Histogram<string> | null> {
  const reg = await getRegistry();
  if (!reg) return null;

  try {
    const { Histogram } = await import("prom-client");
    return new Histogram({
      name,
      help,
      buckets,
      labelNames,
      registers: [reg],
    });
  } catch {
    return null;
  }
}

/**
 * Example HTTP request metrics (can be expanded)
 */
export const httpMetrics = {
  requestsTotal: null as Counter<string> | null,
  requestDurationMs: null as Histogram<string> | null,
};

/**
 * Initialize standard HTTP metrics
 */
export async function initializeHttpMetrics(): Promise<void> {
  httpMetrics.requestsTotal = await createCounter(
    "http_requests_total",
    "Total HTTP requests",
    ["method", "path", "status"]
  );

  httpMetrics.requestDurationMs = await createHistogram(
    "http_request_duration_ms",
    "HTTP request latency in milliseconds",
    [10, 50, 100, 500, 1000, 5000],
    ["method", "path"]
  );
}

/**
 * Record HTTP request
 */
export function recordHttpRequest(
  method: string,
  path: string,
  statusCode: number,
  durationMs: number
): void {
  try {
    httpMetrics.requestsTotal?.inc({ method, path, status: statusCode });
    httpMetrics.requestDurationMs?.observe({ method, path }, durationMs);
  } catch {
    // Silently fail if metrics not available
  }
}

/**
 * Export metrics text
 * Use as /metrics endpoint in FastAPI
 */
export async function exportMetricsText(): Promise<string> {
  return getMetricsText();
}
