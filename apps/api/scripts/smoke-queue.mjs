import { Queue } from "bullmq";

const redisUrl = process.env.UPSTASH_REDIS_URL;
const redisToken = process.env.UPSTASH_REDIS_TOKEN;

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!redisUrl || !redisToken) {
  fail("UPSTASH_REDIS_URL and UPSTASH_REDIS_TOKEN are required for queue smoke checks.");
}

const parsed = new URL(redisUrl);
const connection = {
  host: parsed.hostname,
  port: parsed.port ? Number(parsed.port) : 6379,
  username: parsed.username || "default",
  password: redisToken,
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
