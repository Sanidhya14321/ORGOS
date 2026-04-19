import { Queue, QueueEvents, type JobsOptions } from "bullmq";
import { readEnv } from "../config/env.js";

type RedisConnection = {
  host: string;
  port: number;
  username: string;
  password: string;
  maxRetriesPerRequest: null;
  enableReadyCheck: boolean;
  tls?: Record<string, never> | undefined;
};

let initialized = false;
let deadLetterQueueInstance: Queue;
let csuiteQueueInstance: Queue;
let managerQueueInstance: Queue;
let individualQueueInstance: Queue;
let slaQueueInstance: Queue;
let decomposeQueueInstance: Queue;
let executeQueueInstance: Queue;
let synthesizeQueueInstance: Queue;
let redisConnectionInstance: RedisConnection;
let defaultJobOptionsInstance: JobsOptions;

function initializeQueues() {
  if (initialized) {
    return;
  }

  const env = readEnv();
  const redisUrl = new URL(env.UPSTASH_REDIS_URL);

  redisConnectionInstance = {
    host: redisUrl.hostname,
    port: redisUrl.port ? Number(redisUrl.port) : 6379,
    username: redisUrl.username || "default",
    password: env.UPSTASH_REDIS_TOKEN,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    tls: redisUrl.protocol === "rediss:" ? {} : undefined
  };

  defaultJobOptionsInstance = {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 500
  };

  deadLetterQueueInstance = new Queue("dead_letter", {
    connection: redisConnectionInstance,
    defaultJobOptions: defaultJobOptionsInstance
  });

  csuiteQueueInstance = new Queue("queue:csuite", {
    connection: redisConnectionInstance,
    defaultJobOptions: defaultJobOptionsInstance
  });

  managerQueueInstance = new Queue("queue:manager", {
    connection: redisConnectionInstance,
    defaultJobOptions: defaultJobOptionsInstance
  });

  individualQueueInstance = new Queue("queue:individual", {
    connection: redisConnectionInstance,
    defaultJobOptions: defaultJobOptionsInstance
  });

  slaQueueInstance = new Queue("queue:sla", {
    connection: redisConnectionInstance,
    defaultJobOptions: defaultJobOptionsInstance
  });

  decomposeQueueInstance = new Queue("decompose", {
    connection: redisConnectionInstance,
    defaultJobOptions: defaultJobOptionsInstance
  });

  executeQueueInstance = new Queue("execute", {
    connection: redisConnectionInstance,
    defaultJobOptions: defaultJobOptionsInstance
  });

  synthesizeQueueInstance = new Queue("synthesize", {
    connection: redisConnectionInstance,
    defaultJobOptions: defaultJobOptionsInstance
  });

  initialized = true;
}

export function getDeadLetterQueue(): Queue {
  initializeQueues();
  return deadLetterQueueInstance;
}

export function getCsuiteQueue(): Queue {
  initializeQueues();
  return csuiteQueueInstance;
}

export function getManagerQueue(): Queue {
  initializeQueues();
  return managerQueueInstance;
}

export function getIndividualQueue(): Queue {
  initializeQueues();
  return individualQueueInstance;
}

export function getSlaQueue(): Queue {
  initializeQueues();
  return slaQueueInstance;
}

export function getDecomposeQueue(): Queue {
  initializeQueues();
  return csuiteQueueInstance;
}

export function getExecuteQueue(): Queue {
  initializeQueues();
  return executeQueueInstance;
}

export function getSynthesizeQueue(): Queue {
  initializeQueues();
  return synthesizeQueueInstance;
}

export function getRedisConnection(): RedisConnection {
  initializeQueues();
  return redisConnectionInstance;
}

export function getDefaultJobOptions(): JobsOptions {
  initializeQueues();
  return defaultJobOptionsInstance;
}

async function setupDeadLetterForwarding(queueName: string): Promise<void> {
  initializeQueues();

  const queueEvents = new QueueEvents(queueName, { connection: redisConnectionInstance });
  await queueEvents.waitUntilReady();

  queueEvents.on("failed", async ({ jobId, failedReason }) => {
    const sourceQueue = queueName === "queue:csuite"
      ? csuiteQueueInstance
      : queueName === "queue:manager"
        ? managerQueueInstance
        : queueName === "queue:individual"
          ? individualQueueInstance
          : queueName === "queue:sla"
            ? slaQueueInstance
            : queueName === "execute"
              ? executeQueueInstance
              : queueName === "synthesize"
                ? synthesizeQueueInstance
                : decomposeQueueInstance;

    if (!jobId) {
      return;
    }

    const job = await sourceQueue.getJob(jobId);
    if (!job) {
      return;
    }

    const attemptsAllowed = job.opts.attempts ?? defaultJobOptionsInstance.attempts ?? 1;
    if (job.attemptsMade >= attemptsAllowed) {
      await deadLetterQueueInstance.add("dead_letter_event", {
        sourceQueue: queueName,
        originalJobId: job.id,
        payload: job.data,
        failedReason,
        failedAt: new Date().toISOString()
      });

      console.error("[dead_letter] queued failed job", {
        sourceQueue: queueName,
        jobId: job.id,
        reason: failedReason
      });
    }
  });
}

export function initializeQueueForwarding() {
  initializeQueues();

  void setupDeadLetterForwarding("queue:csuite");
  void setupDeadLetterForwarding("queue:manager");
  void setupDeadLetterForwarding("queue:individual");
  void setupDeadLetterForwarding("queue:sla");
  void setupDeadLetterForwarding("execute");
  void setupDeadLetterForwarding("synthesize");
}

