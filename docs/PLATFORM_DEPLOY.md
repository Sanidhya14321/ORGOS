# ORGOS platform deploy reference

## Processes (production)

Run **API HTTP** and **same codebase worker processes** against shared Redis + Supabase.

| Process | Entry | Responsibility |
|---------|--------|----------------|
| API | `apps/api` Fastify (`src/index.ts` / `src/server.ts`) | HTTP, auth, queues producers |
| C-suite decompose | `startCsuiteDecomposeWorker` | Executive decomposition jobs |
| Manager decompose | `startManagerDecomposeWorker` | Manager decomposition |
| Individual ack | `startIndividualAckWorker` | Individual acknowledgment flow |
| Execute | `startExecuteWorker` | Execution jobs |
| Ingest | `startIngestWorker` | Embedding upserts (when enqueued) |
| SLA | `startSlaWorker` | SLA checks + schedule |
| Synthesize | `startSynthesizeWorker` | Synthesis reports |

All workers started from API server bootstrap in [`apps/api/src/server.ts`](../apps/api/src/server.ts) today — for scale, split workers to separate containers pointing at same `REDIS`/`UPSTASH` URL and service role key.

### Scaling workers (split processes)

Same image/env as API; run additional Node processes that call only the worker starters you need (each needs `UPSTASH_REDIS_URL`, `UPSTASH_REDIS_TOKEN`, `SUPABASE_*`, LLM keys as today). Practical pattern:

1. Copy API container command from prod; replace HTTP entry with a **worker-only** script or `node` invocation that imports [`apps/api/src/server.ts`](../apps/api/src/server.ts) split (if not yet extracted, run a thin `src/worker-entry.ts` that starts e.g. only `startIngestWorker` + `startExecuteWorker` — refactor when traffic warrants).
2. Point all replicas at **one** Redis URL so BullMQ jobs stay single queue.
3. Keep **one** synthesize or decompose consumer per queue name if you rely on ordering; scale horizontally only for idempotent workers (ingest, execute) first.

Until a dedicated worker entry file exists, duplicate API pods with identical bootstrap is acceptable at small scale; disable HTTP on non-API pods via load balancer routing only to API replicas.

## Health

- `GET /health` and `GET /healthz` — DB + Redis checks ([`apps/api/src/routes/health.ts`](../apps/api/src/routes/health.ts)).

## Environment (minimum)

See [`apps/api/src/config/env.ts`](../apps/api/src/config/env.ts) and [`ci/SECRETS_README.md`](../ci/SECRETS_README.md).

Optional: `GROQ_API_KEY` for agent LLM routing (Groq first) and the dashboard **Help** assistant (`POST /api/help/chat`). Optional `GROQ_MODEL` overrides the default Groq chat model in `agent-core` (same env read by `GroqProvider`). `OPENAI_API_KEY` remains optional for document embeddings (vector / hybrid retrieval) only. `ORGOS_LLM_TRACE=1` logs compact LLM completion traces to stderr from agent-core router. `ORGOS_RAG_RETRIEVAL_LOG=1` logs keyword retrieval diagnostics from `retrieveRelevantSections`. `ORGOS_SECTION_TSVECTOR=1` uses RPC `match_org_document_sections_tsvector` when migration [`017_org_document_sections_tsvector.sql`](../packages/db/schema/017_org_document_sections_tsvector.sql) applied; empty RPC result → same lexical path as before. Apply 017 (or 016+017 together): `bash scripts/apply-017-tsvector-migration.sh` or `bash scripts/apply-016-017-rag-migrations.sh` (needs `DATABASE_URL` or `DIRECT_URL`). `ORGOS_RAG_MERGE_RRF=1` declared in [`env.ts`](../apps/api/src/config/env.ts) (validated on API boot via `readEnv`); hybrid merge in `createSupabaseRagSearchClient` reads `process.env.ORGOS_RAG_MERGE_RRF === "1"` so worker unit tests with mock Supabase do not require full env parse. Pass `{ useRrfMerge: boolean }` to override. Default remains score-sum merge.

## Smoke checks

### Local infra (Postgres + Redis)

```bash
node scripts/smoke-local.js
```

Optional skips when you use **only** Supabase cloud + Upstash (no local Postgres/Redis): `ORGOS_SMOKE_SKIP_POSTGRES=1` and/or `ORGOS_SMOKE_SKIP_REDIS=1`.

Full wipe + tech seed + PDF + upload: [E2E_TECH_ORG_RESET.md](../docs/E2E_TECH_ORG_RESET.md).

### Remote API (staging / prod)

Set `ORGOS_SMOKE_API_URL` to API base (no trailing slash), then:

```bash
ORGOS_SMOKE_API_URL=https://api.example.com node scripts/smoke-local.js
```

Checks `GET {API}/health` returns JSON with `status` field.

## Migrations

**Source of truth:** SQL files under [`packages/db/schema/`](../packages/db/schema/). Scripts: [`scripts/apply-remote-schema.sh`](../scripts/apply-remote-schema.sh), [`scripts/apply-016-rag-migration.sh`](../scripts/apply-016-rag-migration.sh), [`scripts/apply-017-tsvector-migration.sh`](../scripts/apply-017-tsvector-migration.sh), one-shot **016 then 017**: [`scripts/apply-016-017-rag-migrations.sh`](../scripts/apply-016-017-rag-migrations.sh).

Before deploy: confirm remote DB applied all migrations through latest file (including `011_add_assigned_position_id.sql` if tasks need `assigned_position_id`). Historical narrative in [`MIGRATION_STATUS.md`](../MIGRATION_STATUS.md) — verify against live DB, not only that doc.
