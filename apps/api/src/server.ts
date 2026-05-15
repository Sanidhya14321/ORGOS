import crypto from "node:crypto";
import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { readEnv, shouldRelaxSecurityForLocalTesting } from "./config/env.js";
import type { AppRedisClient } from "./lib/clients.js";
import {
  canReachRedisUrl,
  createRedisClient,
  createSupabaseAnonClient,
  createSupabaseServiceClient
} from "./lib/clients.js";
import { sendApiError } from "./lib/errors.js";
import { initializeSentry } from "./lib/sentry.js";
import { initializePrometheus, initializeHttpMetrics, exportMetricsText, recordHttpRequest } from "./lib/prometheus.js";
import authPlugin from "./plugins/auth.js";
import authRoutes from "./routes/auth.js";
import goalsRoutes from "./routes/goals.js";
import healthRoutes from "./routes/health.js";
import meRoutes from "./routes/me.js";
import metricsRoutes from "./routes/metrics.js";
import orgRoutes from "./routes/org.js";
import reportsRoutes from "./routes/reports.js";
import recruitmentRoutes from "./routes/recruitment.js";
import expansionRoutes from "./routes/expansion.js";
import settingsRoutes from "./routes/settings.js";
import tasksRoutes from "./routes/tasks.js";
import onboardingRoutes from "./routes/onboarding.js";
import documentsRoutes from "./routes/documents.js";
import helpRoutes from "./routes/help.js";
import goalProposalsRoutes from "./routes/goalProposals.js";
import { initializeQueueForwarding } from "./queue/index.js";
import { startCsuiteDecomposeWorker } from "./queue/workers/decompose.csuite.worker.js";
import { startManagerDecomposeWorker } from "./queue/workers/decompose.manager.worker.js";
import { startIndividualAckWorker } from "./queue/workers/decompose.individual.worker.js";
import { startExecuteWorker } from "./queue/workers/execute.worker.js";
import { startIngestWorker } from "./queue/workers/ingest.worker.js";
import { ensureSlaSchedule, startSlaWorker } from "./queue/workers/sla.worker.js";
import { startSynthesizeWorker } from "./queue/workers/synthesize.worker.js";
import { initializeNotifier } from "./services/notifier.js";
import { registerApiErrorHandler } from "./plugins/errorHandler.js";

declare module "fastify" {
  interface FastifyInstance {
    env: ReturnType<typeof readEnv>;
    supabaseAnon: SupabaseClient;
    supabaseService: SupabaseClient;
    redis: AppRedisClient;
  }

  interface FastifyRequest {
    requestId: string;
    user: User | null;
    userRole: string | null;
    userOrgId: string | null;
    assertOrgAccess?: (targetOrgId: string | null | undefined) => Promise<unknown>;
  }
}

export async function buildServer() {
  const env = readEnv();
  const relaxedLocalSecurity = shouldRelaxSecurityForLocalTesting(env);
  const redis = await createRedisClient(env, {
    allowMemoryFallback: relaxedLocalSecurity
  });
  const fastify = Fastify({
    logger: {
      level: env.NODE_ENV === "production" ? "info" : "debug"
    }
  });

  fastify.decorate("env", env);
  fastify.decorate("supabaseAnon", createSupabaseAnonClient(env));
  fastify.decorate("supabaseService", createSupabaseServiceClient(env));
  fastify.decorate("redis", redis);

  if (redis.mode === "memory") {
    fastify.log.warn("Redis unavailable; using in-memory fallback for API cache and rate limiting");
  }

  fastify.addHook("onRequest", async (request) => {
    request.requestId = crypto.randomUUID();
    request.user = null;
    request.userRole = null;
    request.userOrgId = null;
  });

  fastify.addHook("onSend", async (request, reply) => {
    reply.header("X-Request-ID", request.requestId);
    // Record HTTP metrics
    const startTime = (request as any)._startTime ?? Date.now();
    const durationMs = Date.now() - startTime;
    const requestPath = (request.url ?? "/unknown").split("?")[0] ?? "/unknown";
    recordHttpRequest(request.method, requestPath, reply.statusCode || 500, durationMs);
  });

  registerApiErrorHandler(fastify);
  await fastify.register(cors, {
    origin: env.WEB_ORIGIN,
    credentials: true
  });
  await fastify.register(multipart, {
    attachFieldsToBody: false,
    limits: {
      fileSize: 10 * 1024 * 1024,
      files: 1
    }
  });

  if (!relaxedLocalSecurity) {
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
  }

  fastify.addHook("preHandler", async (request, reply) => {
    if (shouldRelaxSecurityForLocalTesting(fastify.env)) {
      return;
    }

    if (request.method === "POST") {
      const path = request.url.split("?")[0];
      if (
        path === "/api/auth/login" ||
        path === "/api/auth/register" ||
        path === "/api/auth/signup-ceo" ||
        path === "/api/auth/activate-seat" ||
        path === "/api/auth/refresh"
      ) {
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
  await fastify.register(metricsRoutes);

  await fastify.register(async (api) => {
    await api.register(authRoutes);
    await api.register(expansionRoutes);
    await api.register(orgRoutes);
    await api.register(meRoutes);
    await api.register(goalsRoutes);
    await api.register(tasksRoutes);
    await api.register(reportsRoutes);
    await api.register(recruitmentRoutes);
    await api.register(settingsRoutes);
    await api.register(onboardingRoutes);
    await api.register(documentsRoutes);
    await api.register(helpRoutes);
    await api.register(goalProposalsRoutes);
  }, { prefix: "/api" });

  return fastify;
}

export async function start() {
  const server = await buildServer();

  // Initialize observability
  initializeSentry(server.env);
  await initializePrometheus();
  await initializeHttpMetrics();

  initializeNotifier(server);
  const workers: Array<{ close: () => Promise<void> }> = [];

  try {
    const redisReachable = await canReachRedisUrl(server.env.UPSTASH_REDIS_URL);
    if (!redisReachable) {
      throw new Error("Queue Redis endpoint is unreachable");
    }

    initializeQueueForwarding();

    await Promise.race([
      ensureSlaSchedule(),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Queue startup timed out")), 3000);
      })
    ]);

    workers.push(
      startCsuiteDecomposeWorker(),
      startManagerDecomposeWorker(),
      startIndividualAckWorker(),
      startSlaWorker(server),
      startExecuteWorker(),
      startIngestWorker(),
      startSynthesizeWorker()
    );
  } catch (error) {
    server.log.warn({ err: error }, "Queue subsystem disabled; API started without workers");
  }

  server.addHook("onClose", async () => {
    await server.redis.close();
    await Promise.all(workers.map(async (worker) => worker.close()));
  });

  const port = server.env.API_PORT;
  await server.listen({ port, host: "0.0.0.0" });
}
