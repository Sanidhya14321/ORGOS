import { Worker, type Job } from "bullmq";
import type { FastifyInstance } from "fastify";
import { runSlaEvaluationOnce } from "../../services/slaService.js";
import { getRedisConnection, getSlaQueue } from "../index.js";

interface SlaJobData { trigger: "repeat" }

let initializedSchedule = false;

export async function ensureSlaSchedule(): Promise<void> {
  if (initializedSchedule) {
    return;
  }

  await getSlaQueue().add(
    "sla_scan",
    { trigger: "repeat" },
    {
      repeat: { every: 15 * 60 * 1000 },
      jobId: "sla-repeat"
    }
  );

  initializedSchedule = true;
}

export function startSlaWorker(server: FastifyInstance): Worker<SlaJobData> {
  const worker = new Worker<SlaJobData>(
    getSlaQueue().name,
    async (_job: Job<SlaJobData>) => {
      await runSlaEvaluationOnce(server);
    },
    {
      connection: getRedisConnection(),
      concurrency: 1
    }
  );

  worker.on("failed", (job, error) => {
    console.error("sla worker failed", {
      jobId: job?.id,
      attemptsMade: job?.attemptsMade,
      error: error.message
    });
  });

  return worker;
}
