/**
 * Optional Qdrant vector backend for RAG chunk embeddings (REST API, no extra npm dep).
 * When QDRANT_URL is set, ingest writes here instead of Postgres `embeddings`;
 * ragSearchClient reads from here. Embeddings still come from embedTexts() (e.g. OpenAI).
 */

import { createHash, randomUUID } from "node:crypto";

export interface QdrantChunkPayload {
  org_id: string;
  source_type: string;
  source_id: string | null;
  chunk_index: number;
  text_snippet: string;
  doc_type?: string | null;
  department?: string | null;
  branch_id?: string | null;
  knowledge_scope?: string[];
  source_format?: string | null;
  /** Original chunk metadata JSON for debugging / future use */
  meta?: Record<string, unknown>;
}

export function isQdrantVectorStoreEnabled(): boolean {
  return Boolean(process.env.QDRANT_URL?.trim());
}

export function getQdrantCollectionName(): string {
  return process.env.QDRANT_COLLECTION?.trim() || "orgos_embeddings";
}

function qdrantBaseUrl(): string {
  const raw = process.env.QDRANT_URL?.trim();
  if (!raw) {
    throw new Error("QDRANT_URL not set");
  }
  return raw.replace(/\/$/, "");
}

function qdrantHeaders(): Headers {
  const h = new Headers();
  h.set("Content-Type", "application/json");
  const key = process.env.QDRANT_API_KEY?.trim();
  if (key) {
    h.set("api-key", key);
  }
  return h;
}

async function qdrantFetch(path: string, init?: RequestInit): Promise<Response> {
  const base = qdrantBaseUrl();
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = new Headers(qdrantHeaders());
  if (init?.headers) {
    const extra = new Headers(init.headers as HeadersInit);
    extra.forEach((value, key) => {
      headers.set(key, value);
    });
  }
  return fetch(url, { ...init, headers });
}

/** Stable UUID for idempotent upserts / deletes */
export function qdrantPointUuid(
  orgId: string,
  sourceType: string,
  sourceId: string | null,
  chunkIndex: number
): string {
  const input = `${orgId}|${sourceType}|${sourceId ?? ""}|${chunkIndex}`;
  const hash = createHash("sha256").update(input).digest();
  const buf = Buffer.from(hash.subarray(0, 16));
  buf[6] = (buf[6]! & 0x0f) | 0x40;
  buf[8] = (buf[8]! & 0x3f) | 0x80;
  const hex = buf.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export async function ensureQdrantCollection(vectorSize: number): Promise<void> {
  const name = encodeURIComponent(getQdrantCollectionName());
  const get = await qdrantFetch(`/collections/${name}`);
  if (get.status === 200) {
    return;
  }
  if (get.status !== 404) {
    const t = await get.text();
    throw new Error(`Qdrant get collection failed: ${get.status} ${t.slice(0, 400)}`);
  }

  const put = await qdrantFetch(`/collections/${name}`, {
    method: "PUT",
    body: JSON.stringify({
      vectors: {
        size: vectorSize,
        distance: "Cosine"
      }
    })
  });

  if (!put.ok) {
    const t = await put.text();
    throw new Error(`Qdrant create collection failed: ${put.status} ${t.slice(0, 400)}`);
  }
}

function flattenMetadata(meta: Record<string, unknown> | undefined): Partial<QdrantChunkPayload> {
  if (!meta) {
    return {};
  }
  const docType = typeof meta.docType === "string" ? meta.docType : typeof meta.doc_type === "string" ? meta.doc_type : null;
  const department = typeof meta.department === "string" ? meta.department : null;
  const branchId = typeof meta.branchId === "string" ? meta.branchId : typeof meta.branch_id === "string" ? meta.branch_id : null;
  const sourceFormat =
    typeof meta.sourceFormat === "string" ? meta.sourceFormat : typeof meta.source_format === "string" ? meta.source_format : null;
  let knowledgeScope: string[] = [];
  const ks = meta.knowledgeScope ?? meta.knowledge_scope;
  if (Array.isArray(ks)) {
    knowledgeScope = ks.map((x) => String(x));
  }
  return { doc_type: docType, department, branch_id: branchId, knowledge_scope: knowledgeScope, source_format: sourceFormat };
}

export async function upsertChunksToQdrant(params: {
  orgId: string;
  sourceType: string;
  sourceId: string | null;
  chunks: Array<{ text: string; metadata?: Record<string, unknown> }>;
  embeddings: number[][];
}): Promise<void> {
  const { orgId, sourceType, sourceId, chunks, embeddings } = params;
  if (chunks.length === 0) {
    return;
  }
  const dim = embeddings[0]?.length ?? 0;
  if (!dim) {
    throw new Error("Qdrant upsert: empty embedding vector");
  }
  await ensureQdrantCollection(dim);

  const collection = encodeURIComponent(getQdrantCollectionName());
  const batchSize = 64;

  for (let offset = 0; offset < chunks.length; offset += batchSize) {
    const slice = chunks.slice(offset, offset + batchSize);
    const embSlice = embeddings.slice(offset, offset + batchSize);
    const points = slice.map((chunk, j) => {
      const i = offset + j;
      const flat = flattenMetadata(chunk.metadata);
      const vec = embSlice[j];
      if (!vec || vec.length !== dim) {
        return null;
      }
      return {
        id: qdrantPointUuid(orgId, sourceType, sourceId, i),
        vector: vec,
        payload: {
          org_id: orgId,
          source_type: sourceType,
          source_id: sourceId,
          chunk_index: i,
          text_snippet: chunk.text.slice(0, 12_000),
          doc_type: flat.doc_type ?? null,
          department: flat.department ?? null,
          branch_id: flat.branch_id ?? null,
          knowledge_scope: flat.knowledge_scope ?? [],
          source_format: flat.source_format ?? null,
          meta: chunk.metadata ?? {}
        } satisfies Record<string, unknown>
      };
    }).filter((p): p is NonNullable<typeof p> => p !== null);

    if (points.length === 0) {
      continue;
    }

    const res = await qdrantFetch(`/collections/${collection}/points?wait=true`, {
      method: "PUT",
      body: JSON.stringify({ points })
    });

    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Qdrant upsert points failed: ${res.status} ${t.slice(0, 500)}`);
    }
  }
}

function buildSearchFilter(
  orgId: string,
  options: {
    sourceTypes?: string[];
    docTypes?: string[] | null;
    department?: string | null;
    branchId?: string | null;
    knowledgeScopes?: string[] | null;
    sourceFormats?: string[] | null;
  }
): Record<string, unknown> {
  const must: Array<Record<string, unknown>> = [{ key: "org_id", match: { value: orgId } }];

  const types = options.sourceTypes?.filter(Boolean);
  if (types && types.length > 0) {
    must.push({
      should: types.map((value) => ({ key: "source_type", match: { value } })),
      min_should_match: 1
    });
  }

  if (options.department) {
    must.push({ key: "department", match: { value: options.department } });
  }
  if (options.branchId) {
    must.push({ key: "branch_id", match: { value: options.branchId } });
  }
  if (options.docTypes && options.docTypes.length > 0) {
    must.push({
      should: options.docTypes.map((value) => ({ key: "doc_type", match: { value } })),
      min_should_match: 1
    });
  }
  if (options.knowledgeScopes && options.knowledgeScopes.length > 0) {
    must.push({
      key: "knowledge_scope",
      match: { any: options.knowledgeScopes }
    });
  }
  if (options.sourceFormats && options.sourceFormats.length > 0) {
    must.push({
      should: options.sourceFormats.map((value) => ({ key: "source_format", match: { value } })),
      min_should_match: 1
    });
  }

  return { must };
}

export async function searchQdrantVectors(params: {
  orgId: string;
  queryVector: number[];
  topK: number;
  branchId?: string | null;
  department?: string | null;
  docTypes?: string[];
  knowledgeScopes?: string[];
  sourceFormats?: string[];
  sourceTypes?: string[];
}): Promise<
  Array<{
    id: string;
    sourceType: string;
    sourceId: string | null;
    chunkIndex: number;
    score: number;
    textSnippet: string;
    metadata: Record<string, unknown>;
  }>
> {
  const collection = encodeURIComponent(getQdrantCollectionName());
  const defaultTypes = ["document_section", "report", "meeting_ingestion"];
  const filter = buildSearchFilter(params.orgId, {
    sourceTypes: params.sourceTypes ?? defaultTypes,
    docTypes: params.docTypes ?? null,
    department: params.department ?? null,
    branchId: params.branchId ?? null,
    knowledgeScopes: params.knowledgeScopes ?? null,
    sourceFormats: params.sourceFormats ?? null
  });

  const body: Record<string, unknown> = {
    vector: params.queryVector,
    limit: Math.max(1, params.topK),
    with_payload: true,
    filter
  };

  const res = await qdrantFetch(`/collections/${collection}/points/search`, {
    method: "POST",
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Qdrant search failed: ${res.status} ${t.slice(0, 500)}`);
  }

  const json = (await res.json()) as {
    result?: Array<{
      id?: unknown;
      score?: number;
      payload?: Record<string, unknown>;
    }>;
  };

  const rows = json.result ?? [];
  return rows.map((hit) => {
    const p = hit.payload ?? {};
    const meta = (p.meta as Record<string, unknown>) ?? {};
    return {
      id: String(hit.id ?? p.chunk_index ?? randomUUID()),
      sourceType: String(p.source_type ?? "unknown"),
      sourceId: (p.source_id as string | null) ?? null,
      chunkIndex: Number(p.chunk_index ?? 0),
      score: Number(hit.score ?? 0),
      textSnippet: String(p.text_snippet ?? ""),
      metadata: {
        ...meta,
        docType: p.doc_type,
        department: p.department,
        branchId: p.branch_id,
        knowledgeScope: p.knowledge_scope,
        sourceFormat: p.source_format,
        retrievalSource: "vector"
      }
    };
  });
}

export async function deleteQdrantPointsBySource(params: {
  orgId: string;
  sourceType: string;
  sourceId: string;
}): Promise<void> {
  const collection = encodeURIComponent(getQdrantCollectionName());
  const res = await qdrantFetch(`/collections/${collection}/points/delete?wait=true`, {
    method: "POST",
    body: JSON.stringify({
      filter: {
        must: [
          { key: "org_id", match: { value: params.orgId } },
          { key: "source_type", match: { value: params.sourceType } },
          { key: "source_id", match: { value: params.sourceId } }
        ]
      }
    })
  });

  if (!res.ok) {
    const t = await res.text();
    console.warn("Qdrant delete points failed", res.status, t.slice(0, 300));
  }
}
