/**
 * embeddingService - scaffolding for text chunking, embedding, and upsert
 * Implement provider-specific calls (OpenAI, Anthropic, etc.) in embedTexts()
 */

import { isQdrantVectorStoreEnabled, upsertChunksToQdrant } from "./qdrantVectorStore.js";

export function chunkText(text: string, chunkSize = 700, overlap = 350): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    if (end === text.length) break;
    start = Math.max(0, end - overlap);
  }
  return chunks;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  // Placeholder: wire this to your embeddings provider.
  // Throwing explicitly to make missing configuration obvious during development.
    const provider = process.env.EMBEDDING_PROVIDER || 'openai';
    if (provider === 'openai') {
      const key = process.env.OPENAI_API_KEY;
      if (!key) throw new Error('OPENAI_API_KEY not set for embeddings');

      // OpenAI embeddings endpoint
      const url = 'https://api.openai.com/v1/embeddings';
      const model = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';

      const batches: string[][] = [];
      // very simple batching to avoid huge requests
      const batchSize = 16;
      for (let i = 0; i < texts.length; i += batchSize) batches.push(texts.slice(i, i + batchSize));

      const results: number[][] = [];
      for (const batch of batches) {
        const body = JSON.stringify({ model, input: batch });
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${key}`,
          },
          body,
        });

        if (!res.ok) {
          const txt = await res.text();
          throw new Error(`OpenAI embeddings error: ${res.status} ${txt}`);
        }

        const data = await res.json();
        if (!data || !data.data) throw new Error('Invalid embedding response');
        for (const item of data.data) results.push(item.embedding as number[]);
      }

      return results;
    }

    throw new Error(`Unsupported embedding provider: ${provider}`);
}

export interface EmbeddingChunk {
  text: string;
  metadata?: Record<string, unknown>;
}

export async function upsertEmbeddings(
  dbClient: any,
  orgId: string,
  sourceType: string,
  sourceId: string | null,
  chunks: Array<string | EmbeddingChunk>,
  embeddings?: number[][]
) {
  // dbClient is expected to be a pg client or supabase client with query/upsert capabilities.
  // This function should upsert rows into the `embeddings` table created by the migration.
  if (!dbClient) throw new Error('dbClient required for upsertEmbeddings');

  const normalizedChunks = chunks.map((chunk) =>
    typeof chunk === "string" ? { text: chunk, metadata: {} } : { text: chunk.text, metadata: chunk.metadata ?? {} }
  );

  if (!embeddings) {
    embeddings = await embedTexts(normalizedChunks.map((chunk) => chunk.text));
  }

  if (isQdrantVectorStoreEnabled()) {
    await upsertChunksToQdrant({
      orgId,
      sourceType,
      sourceId,
      chunks: normalizedChunks.map((c) => ({ text: c.text, metadata: c.metadata ?? {} })),
      embeddings: embeddings ?? []
    });
    return;
  }

  if (typeof dbClient.query === 'function') {
    const values: any[] = [];
    const placeholders: string[] = [];
    let idx = 1;

    for (let i = 0; i < normalizedChunks.length; i++) {
      const snippet = normalizedChunks[i]?.text;
      const vector = embeddings?.[i];
      if (!vector || !Array.isArray(vector)) continue;

      const metadata = normalizedChunks[i]?.metadata ?? {};
      const chunkIndex =
        typeof metadata.sectionIndex === "number" && Number.isFinite(metadata.sectionIndex)
          ? metadata.sectionIndex
          : i;

      const vecLiteral = '[' + vector.join(',') + ']';
      placeholders.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}::vector, $${idx++})`);
      values.push(orgId, sourceType, sourceId, chunkIndex, snippet, vecLiteral, JSON.stringify(metadata));
    }

    if (placeholders.length > 0) {
      const sql = `INSERT INTO embeddings (org_id, source_type, source_id, chunk_index, text_snippet, embedding, metadata) VALUES ${placeholders.join(',')}`;

      try {
        await dbClient.query(sql, values);
      } catch (err) {
        console.warn('bulk upsertEmbeddings error', err);
        for (let i = 0; i < normalizedChunks.length; i++) {
          try {
            const metadata = normalizedChunks[i]?.metadata ?? {};
            const chunkIndex =
              typeof metadata.sectionIndex === "number" && Number.isFinite(metadata.sectionIndex)
                ? metadata.sectionIndex
                : i;
            await dbClient.query(
              `INSERT INTO embeddings (org_id, source_type, source_id, chunk_index, text_snippet, embedding, metadata) VALUES ($1,$2,$3,$4,$5,$6::vector,$7)`,
              [
                orgId,
                sourceType,
                sourceId,
                chunkIndex,
                normalizedChunks[i]?.text,
                '[' + (embeddings?.[i] || []).join(',') + ']',
                JSON.stringify(metadata)
              ]
            );
          } catch (err2) {
            console.warn('fallback insert failed', err2);
          }
        }
      }
    }

    return;
  }

  if (typeof dbClient.from === 'function') {
    try {
      const rows = normalizedChunks.map((chunk, i) => {
        const metadata = chunk.metadata ?? {};
        const chunkIndex =
          typeof metadata.sectionIndex === "number" && Number.isFinite(metadata.sectionIndex)
            ? metadata.sectionIndex
            : i;
        return {
          org_id: orgId,
          source_type: sourceType,
          source_id: sourceId,
          chunk_index: chunkIndex,
          text_snippet: chunk.text,
          embedding: embeddings?.[i],
          metadata
        };
      });
      await dbClient.from('embeddings').insert(rows);
    } catch (err) {
      console.warn('upsertEmbeddings(supabase) error', err);
    }

    return;
  }

  throw new Error('Unsupported dbClient for upsertEmbeddings');
}

export default {
  chunkText,
  embedTexts,
  upsertEmbeddings,
};
