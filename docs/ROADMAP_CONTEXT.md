# ORGOS roadmap context (living)

**Purpose:** Resume work without losing thread. Update at end of each phase.

## Current focus

Platform + RAG: vectorless default, PDF page-accurate sections, optional embedding ingest when `OPENAI_API_KEY` set.

## If you resume here — read first

1. [PLATFORM_DEPLOY.md](./PLATFORM_DEPLOY.md) — processes, health, smoke env vars  
2. [GOLDEN_JOURNEY_STAGING.md](./GOLDEN_JOURNEY_STAGING.md) — demo script  
3. [adr/](./adr/) — irreversible decisions  

## Last decisions (newest last)

| Date | Decision |
|------|-----------|
| 2026-05-13 | Default document `retrieval_mode` stays **vectorless**; vector/hybrid enqueue ingest only when OpenAI key present; otherwise effective mode vectorless + warning in `ingestion_warnings`. |
| 2026-05-13 | PDF indexing uses **per-page** text from `pdf-parse` when available; `page_start`/`page_end` match real PDF page numbers. |

## Open risks

- Remote Supabase schema cache misses (see MEMORY.md).  
- Migrations: always verify `packages/db/schema` vs deployed DB before prod deploy.

## Phase exit checklist (copy per leaf)

- [ ] Migrations applied (name versions in commit or ADR)  
- [ ] `npm test` (root) green  
- [ ] This file + ADR updated  
- [ ] Owner paths listed below  

**Owner paths this phase:** `docs/`, `MEMORY.md`, `MIGRATION_STATUS.md`, `scripts/smoke-local.js`, `apps/api/src/services/{ragRetrieval,localFileParser,documentRetrieval,ragSearchClient}.ts`, `apps/api/src/routes/documents.ts`, `packages/agent-core/src/{rag.ts,llm/router.ts,agents/synthesisAgent.ts,agents/hierarchical-agent.ts}`, `apps/web/app/dashboard/knowledge/page.tsx`, `apps/web/lib/{api,access}.ts`, `scripts/eval-agents.mjs`, `package.json`.
