import crypto from "node:crypto";
import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Redis } from "@upstash/redis";
import { readEnv } from "./config/env.js";
import { createRedisClient, createSupabaseAnonClient, createSupabaseServiceClient } from "./lib/clients.js";
import { sendApiError } from "./lib/errors.js";
import authPlugin from "./plugins/auth.js";
import authRoutes from "./routes/auth.js";
import goalsRoutes from "./routes/goals.js";
import healthRoutes from "./routes/health.js";
import meRoutes from "./routes/me.js";
import orgRoutes from "./routes/org.js";
import reportsRoutes from "./routes/reports.js";
import tasksRoutes from "./routes/tasks.js";
import { initializeQueueForwarding } from "./queue/index.js";
import { startCsuiteDecomposeWorker } from "./queue/workers/decompose.csuite.worker.js";
import { startManagerDecomposeWorker } from "./queue/workers/decompose.manager.worker.js";
import { startIndividualAckWorker } from "./queue/workers/decompose.individual.worker.js";
import { startExecuteWorker } from "./queue/workers/execute.worker.js";
import { ensureSlaSchedule, startSlaWorker } from "./queue/workers/sla.worker.js";
import { startSynthesizeWorker } from "./queue/workers/synthesize.worker.js";
import { initializeNotifier } from "./services/notifier.js";

declare module "fastify" {
  interface FastifyInstance {
    env: ReturnType<typeof readEnv>;
    supabaseAnon: SupabaseClient;
    supabaseService: SupabaseClient;
    redis: Redis;
  }

  interface FastifyRequest {
    requestId: string;
    user: User | null;
    userRole: string | null;
  }
}

export async function buildServer() {
  const env = readEnv();
  const fastify = Fastify({
    logger: {
      level: env.NODE_ENV === "production" ? "info" : "debug"
    }
  });

  fastify.decorate("env", env);
  fastify.decorate("supabaseAnon", createSupabaseAnonClient(env));
  fastify.decorate("supabaseService", createSupabaseServiceClient(env));
  fastify.decorate("redis", createRedisClient(env));

  fastify.addHook("onRequest", async (request) => {
    request.requestId = crypto.randomUUID();
    request.user = null;
    request.userRole = null;
  });

  fastify.addHook("onSend", async (request, reply) => {
    reply.header("X-Request-ID", request.requestId);
  });

  fastify.setErrorHandler(async (error, request, reply) => {
    request.log.error({ err: error }, "Unhandled API error");
    return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Internal server error");
  });

  await fastify.register(cors, {
    origin: env.WEB_ORIGIN,
    credentials: true
  });

  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
    keyGenerator: (request) => request.user?.id ?? request.ip,
    errorResponseBuilder: (request) => ({
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests",
        requestId: request.requestId
      }
    })
  });

  fastify.addHook("preHandler", async (request, reply) => {
    if (request.method === "POST") {
      const path = request.url.split("?")[0];
      if (path === "/api/auth/login" || path === "/api/auth/register" || path === "/api/auth/refresh") {
        const key = `auth-post:${request.ip}:${path}`;
        const count = await fastify.redis.incr(key);
        if (count === 1) {
          await fastify.redis.expire(key, 15 * 60);
        }
        if (count > 40) {
          return sendApiError(reply, request, 429, "RATE_LIMITED", "Authentication rate limit exceeded");
        }
      }
    }

    if (request.method === "POST" && request.url.startsWith("/api/goals")) {
      const isExec = request.userRole === "ceo" || request.userRole === "cfo";
      if (isExec) {
        const key = `goal-create:${request.user?.id ?? request.ip}`;
        const count = await fastify.redis.incr(key);
        if (count === 1) {
          await fastify.redis.expire(key, 60 * 60);
        }
        if (count > 10) {
          return sendApiError(reply, request, 429, "RATE_LIMITED", "Goal creation rate limit exceeded");
        }
      }
    }
  });

  await fastify.register(sensible);
  await fastify.register(authPlugin);

  await fastify.register(healthRoutes);

  await fastify.register(async (api) => {
    await api.register(authRoutes);
    await api.register(orgRoutes);
    await api.register(meRoutes);
    await api.register(goalsRoutes);
    await api.register(tasksRoutes);
    await api.register(reportsRoutes);
  }, { prefix: "/api" });

  return fastify;
}

export async function start() {
  const server = await buildServer();
  initializeNotifier(server);
  initializeQueueForwarding();
  await ensureSlaSchedule();

  const workers = [
    startCsuiteDecomposeWorker(),
    startManagerDecomposeWorker(),
    startIndividualAckWorker(),
    startSlaWorker(server),
    startExecuteWorker(),
    startSynthesizeWorker()
  ];

  server.addHook("onClose", async () => {
    await Promise.all(workers.map(async (worker) => worker.close()));
  });

  const port = server.env.API_PORT;
  await server.listen({ port, host: "0.0.0.0" });
}
