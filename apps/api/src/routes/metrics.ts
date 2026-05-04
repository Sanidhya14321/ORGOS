import type { FastifyPluginAsync } from "fastify";
import { exportMetricsText } from "../lib/prometheus.js";

const metricsRoutes: FastifyPluginAsync = async (fastify) => {
  // Prometheus metrics endpoint
  // Used by: Prometheus scrape, Grafana, Datadog Agent, etc.
  fastify.get("/metrics", async (_request, reply) => {
    try {
      const metricsText = await exportMetricsText();
      
      reply.header("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
      return reply.send(metricsText || "# No metrics available\n");
    } catch (error) {
      fastify.log.error({ err: error }, "Failed to export metrics");
      return reply.send("# Error exporting metrics\n");
    }
  });
};

export default metricsRoutes;
