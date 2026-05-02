import { Worker, type Job } from "bullmq";
import embeddingService from "../../services/embeddingService.js";
import { createSupabaseServiceClient } from "../../lib/clients.js";
import { readEnv } from "../../config/env.js";
import { getRedisConnection } from "../index.js";

interface IngestJobData {
  orgId: string;
  sourceType: string;
  sourceId: string | null;
  text: string;
}

export async function processIngestJob(job: Job<IngestJobData>): Promise<void> {
  const env = readEnv();
  const supabase = createSupabaseServiceClient(env);
  const { orgId, sourceType, sourceId, text } = job.data;

  if (!orgId || !sourceType || !text) {
    throw new Error("Invalid ingest job payload");
  }

  const chunks = embeddingService.chunkText(text);
  await embeddingService.upsertEmbeddings(supabase, orgId, sourceType, sourceId, chunks);
}

export function startIngestWorker(): Worker<IngestJobData> {
  const worker = new Worker<IngestJobData>(
    "ingest",
    async (job) => {
      await processIngestJob(job);
    },
    {
      connection: getRedisConnection(),
      concurrency: 2
    }
  );

  worker.on("failed", (job, error) => {
    console.error("ingest worker failed", {
      jobId: job?.id,
      attemptsMade: job?.attemptsMade,
      error: error.message
    });
  });

  return worker;
}

