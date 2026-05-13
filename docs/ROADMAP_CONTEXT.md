# ORGOS roadmap context (living)

**Purpose:** Resume work without losing thread. Update at end of each phase.

## Current focus

Platform + RAG: vectorless default, PDF page-accurate sections, optional embedding ingest when `OPENAI_API_KEY` set.

## If you resume here — read first

1. [PLATFORM_DEPLOY.md](./PLATFORM_DEPLOY.md) — processes, health, smoke env vars  
2. [GOLDEN_JOURNEY_STAGING.md](./GOLDEN_JOURNEY_STAGING.md) — demo script  
3. [E2E_TECH_ORG_RESET.md](./E2E_TECH_ORG_RESET.md) — wipe + tech seed + PDF + upload runbook  
4. [adr/](./adr/) — irreversible decisions (include `adr-0005-hybrid-rrf-merge.md` for hybrid merge)  

## Last decisions (newest last)

| Date | Decision |
|------|-----------|
| 2026-05-13 | Default document `retrieval_mode` stays **vectorless**; vector/hybrid enqueue ingest only when OpenAI key present; otherwise effective mode vectorless + warning in `ingestion_warnings`. |
| 2026-05-13 | Optional FTS: `ORGOS_SECTION_TSVECTOR=1` + migration `017_org_document_sections_tsvector.sql` → `retrieveRelevantSections` calls `match_org_document_sections_tsvector` first; RPC empty/error → lexical keyword path unchanged. |
| 2026-05-13 | Non-prod wipe: `npm run db:reset-nonprod` requires `ORGOS_CONFIRM_E2E_RESET=1`. Tech E2E seed + PDF + upload runbook: [`E2E_TECH_ORG_RESET.md`](./E2E_TECH_ORG_RESET.md). |
| 2026-05-13 | Hybrid merge: `ORGOS_RAG_MERGE_RRF=1` → `reciprocalRankFusionMerge` over vector + lexical lists in `ragSearchClient`; else legacy score-sum merge (`mergeSearchResultsScoreSum`). Tests: `apps/api/test/rag-search-merge.test.ts`. ADR: [`adr-0005-hybrid-rrf-merge.md`](./adr/adr-0005-hybrid-rrf-merge.md). |

## Open risks

- Remote Supabase schema cache misses (see MEMORY.md).  
- Migrations: always verify `packages/db/schema` vs deployed DB before prod deploy.

## Phase exit checklist

### CI / repo (done for this branch — re-run before merge)

- [x] Migrations `016` / `017` in repo + `scripts/apply-016-017-rag-migrations.sh` documented in [`PLATFORM_DEPLOY.md`](./PLATFORM_DEPLOY.md)  
- [x] `npm test` (root) green  
- [x] `npm run typecheck` + `npm run build` green  
- [x] This file + ADR updated (incl. `adr-0005`)  
- [x] Owner paths listed below  

### Remote staging / prod (operator after deploy)

- [ ] Postgres: apply `016` then `017` (combined script or individual); confirm RPC + columns exist before `ORGOS_SECTION_TSVECTOR=1` / `ORGOS_RAG_MERGE_RRF=1`  
- [ ] `ORGOS_SMOKE_API_URL=<api> node scripts/smoke-local.js`  
- [ ] [`GOLDEN_JOURNEY_STAGING.md`](./GOLDEN_JOURNEY_STAGING.md) manual walk  

**Owner paths this phase:** `docs/`, `MEMORY.md`, `MIGRATION_STATUS.md`, `scripts/{smoke-local.js,reset-nonprod-supabase.mjs,generate-tech-handbook-pdf.mjs,e2e-upload-knowledge-pdf.mjs}`, `packages/db/seeds/`, `apps/api/src/services/{ragRetrieval,localFileParser,documentRetrieval,ragSearchClient,ragSearchMerge}.ts`, `apps/api/src/routes/documents.ts`, `packages/agent-core/src/{rag.ts,llm/router.ts,agents/synthesisAgent.ts,agents/hierarchical-agent.ts}`, `apps/web/app/dashboard/knowledge/page.tsx`, `apps/web/lib/{api,access}.ts`, `scripts/eval-agents.mjs`, `package.json`.
