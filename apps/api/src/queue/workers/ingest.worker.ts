/**
 * ingest.worker - processes ingestion jobs (meeting_ingestions, reports, etc.)
 * Expected job shape: { orgId, sourceType, sourceId, text }
 */

import embeddingService from '../services/embeddingService';

export async function processIngestJob(job: any) {
  const { orgId, sourceType, sourceId, text, dbClient } = job.data || {};
  if (!text || !orgId) {
    console.warn('ingest.worker: missing text or orgId');
    return;
  }

  const chunks = embeddingService.chunkText(text);
  try {
    await embeddingService.upsertEmbeddings(dbClient, orgId, sourceType, sourceId || null, chunks);
  } catch (err) {
    console.error('processIngestJob error', err);
  }
}

export default processIngestJob;
