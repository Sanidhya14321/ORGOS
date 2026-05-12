import type { FastifyPluginAsync } from "fastify";

const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/healthz", async (_request, reply) => {
    const dbCheck = fastify.supabaseService.from("users").select("id").limit(1);
    const redisCheck = fastify.redis.mode === "memory"
      ? Promise.reject(new Error("Using in-memory Redis fallback"))
      : fastify.redis.ping();

    const [db, redis] = await Promise.allSettled([dbCheck, redisCheck]);

    const status = db.status === "fulfilled" && redis.status === "fulfilled" ? "ok" : "degraded";

    return reply.send({
      status,
      db: db.status,
      redis: redis.status,
      redisMode: fastify.redis.mode,
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  });

  fastify.get("/health", async (_request, reply) => {
    const dbCheck = fastify.supabaseService.from("users").select("id").limit(1);
    const redisCheck = fastify.redis.mode === "memory"
      ? Promise.reject(new Error("Using in-memory Redis fallback"))
      : fastify.redis.ping();

    const [db, redis] = await Promise.allSettled([dbCheck, redisCheck]);

    const status = db.status === "fulfilled" && redis.status === "fulfilled" ? "ok" : "degraded";

    return reply.send({
      status,
      db: db.status,
      redis: redis.status,
      redisMode: fastify.redis.mode,
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  });
};

export default healthRoutes;
