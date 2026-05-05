import { Queue } from "bullmq";

const upstashUrl = process.env.UPSTASH_REDIS_URL;
const upstashToken = process.env.UPSTASH_REDIS_TOKEN;
const redisUrl = process.env.REDIS_URL || upstashUrl || "redis://localhost:6379";
const redisPassword = process.env.REDIS_PASSWORD || upstashToken || null;

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!redisUrl) {
  fail("No Redis URL available. Set UPSTASH_REDIS_URL or REDIS_URL.");
}

const parsed = new URL(redisUrl);
const connection = {
  host: parsed.hostname,
  port: parsed.port ? Number(parsed.port) : 6379,
  username: parsed.username || undefined,
  password: redisPassword || undefined,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  tls: parsed.protocol === "rediss:" ? {} : undefined
};

const queue = new Queue("synthesize", { connection });

try {
  const job = await queue.add("smoke_queue_event", {
    createdAt: new Date().toISOString(),
    source: "smoke-check"
  }, {
    removeOnComplete: true,
    removeOnFail: true
  });

  const counts = await queue.getJobCounts("waiting", "active", "completed", "failed", "delayed");
  console.log(JSON.stringify({ enqueuedJobId: job.id, counts }, null, 2));
} finally {
  await queue.close();
}
