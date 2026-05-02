import { FastifyInstance } from 'fastify';
import embeddingService from '../services/embeddingService.js';

function cosineSimilarity(a: number[], b: number[]) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export default async function registerSearchRoute(server: FastifyInstance) {
  server.get('/search', async (request, reply) => {
    const q = (request.query as any).q;
    const orgId = (request.query as any).orgId;
    const top = parseInt(((request.query as any).top) || '5', 10);

    if (!q || !orgId) return reply.code(400).send({ error: 'q and orgId query params required' });

    // Embed the query
    let qEmbedding: number[];
    try {
      const res = await embeddingService.embedTexts([q]);
      qEmbedding = res[0];
    } catch (err: any) {
      request.log.error({ err }, 'Failed to compute query embedding');
      return reply.code(500).send({ error: 'Failed to compute embedding' });
    }

    // Try server.supabaseService (supabase client)
    const supabase = (server as any).supabaseService;
    if (supabase && typeof supabase.from === 'function') {
      try {
        // Attempt to fetch candidate rows for the org. Limit to 1000 for safety.
        const { data, error } = await supabase
          .from('embeddings')
          .select('id, source_type, source_id, chunk_index, text_snippet, metadata, created_at, embedding')
          .eq('org_id', orgId)
          .limit(1000);

        if (error) {
          request.log.warn({ err: error }, 'Supabase embeddings select error');
          return reply.code(500).send({ error: 'Storage query failed' });
        }

        if (!data || !Array.isArray(data)) return reply.code(204).send({ results: [] });

        // Compute similarity in JS if embeddings returned as arrays
        const scored: Array<any> = [];
        for (const row of data) {
          const emb = row.embedding;
          if (!emb || !Array.isArray(emb)) continue;
          const score = cosineSimilarity(qEmbedding, emb as number[]);
          scored.push({ ...row, score });
        }

        scored.sort((a, b) => b.score - a.score);
        const topK = scored.slice(0, top);
        return reply.send({ results: topK });
      } catch (err) {
        request.log.error({ err }, 'Search route supabase fallback error');
        return reply.code(500).send({ error: 'Search failed' });
      }
    }

    // If no suitable DB client is available, return not implemented
    return reply.code(501).send({ error: 'Vector search backend not configured' });
  });
}

