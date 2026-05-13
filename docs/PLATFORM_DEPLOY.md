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

## Health

- `GET /health` and `GET /healthz` — DB + Redis checks ([`apps/api/src/routes/health.ts`](../apps/api/src/routes/health.ts)).

## Environment (minimum)

See [`apps/api/src/config/env.ts`](../apps/api/src/config/env.ts) and [`ci/SECRETS_README.md`](../ci/SECRETS_README.md).

Optional: `OPENAI_API_KEY` for document embeddings (vector / hybrid retrieval). `ORGOS_LLM_TRACE=1` logs compact LLM completion traces to stderr from agent-core router. `ORGOS_RAG_RETRIEVAL_LOG=1` logs keyword retrieval diagnostics from `retrieveRelevantSections`.

## Smoke checks

### Local infra (Postgres + Redis)

```bash
node scripts/smoke-local.js
```

### Remote API (staging / prod)

Set `ORGOS_SMOKE_API_URL` to API base (no trailing slash), then:

```bash
ORGOS_SMOKE_API_URL=https://api.example.com node scripts/smoke-local.js
```

Checks `GET {API}/health` returns JSON with `status` field.

## Migrations

**Source of truth:** SQL files under [`packages/db/schema/`](../packages/db/schema/). Scripts: [`scripts/apply-remote-schema.sh`](../scripts/apply-remote-schema.sh), [`scripts/apply-016-rag-migration.sh`](../scripts/apply-016-rag-migration.sh).

Before deploy: confirm remote DB applied all migrations through latest file (including `011_add_assigned_position_id.sql` if tasks need `assigned_position_id`). Historical narrative in [`MIGRATION_STATUS.md`](../MIGRATION_STATUS.md) — verify against live DB, not only that doc.
