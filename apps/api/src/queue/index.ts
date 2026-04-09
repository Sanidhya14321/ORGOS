import { Queue, QueueEvents, type JobsOptions } from "bullmq";
import { readEnv } from "../config/env.js";

const env = readEnv();
const redisUrl = new URL(env.UPSTASH_REDIS_URL);

const redisConnection = {
  host: redisUrl.hostname,
  port: redisUrl.port ? Number(redisUrl.port) : 6379,
  username: redisUrl.username || "default",
  password: env.UPSTASH_REDIS_TOKEN,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  tls: redisUrl.protocol === "rediss:" ? {} : undefined
};

const defaultJobOptions: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 2000 },
  removeOnComplete: 100,
  removeOnFail: 500
};

export const deadLetterQueue = new Queue("dead_letter", {
  connection: redisConnection,
  defaultJobOptions
});

export const decomposeQueue = new Queue("decompose", {
  connection: redisConnection,
  defaultJobOptions
});

export const executeQueue = new Queue("execute", {
  connection: redisConnection,
  defaultJobOptions
});

export const synthesizeQueue = new Queue("synthesize", {
  connection: redisConnection,
  defaultJobOptions
});

async function setupDeadLetterForwarding(queueName: string): Promise<void> {
  const queueEvents = new QueueEvents(queueName, { connection: redisConnection });
  await queueEvents.waitUntilReady();

  queueEvents.on("failed", async ({ jobId, failedReason }) => {
    const sourceQueue = queueName === "decompose"
      ? decomposeQueue
      : queueName === "execute"
        ? executeQueue
        : synthesizeQueue;

    if (!jobId) {
      return;
    }

    const job = await sourceQueue.getJob(jobId);
    if (!job) {
      return;
    }

    const attemptsAllowed = job.opts.attempts ?? defaultJobOptions.attempts ?? 1;
    if (job.attemptsMade >= attemptsAllowed) {
      await deadLetterQueue.add("dead_letter_event", {
        sourceQueue: queueName,
        originalJobId: job.id,
        payload: job.data,
        failedReason,
        failedAt: new Date().toISOString()
      });

      // Notifier comes in Chunk 6. For now, log as required.
      console.error("[dead_letter] queued failed job", {
        sourceQueue: queueName,
        jobId: job.id,
        reason: failedReason
      });
    }
  });
}

await setupDeadLetterForwarding("decompose");
await setupDeadLetterForwarding("execute");
await setupDeadLetterForwarding("synthesize");

export { redisConnection, defaultJobOptions };
