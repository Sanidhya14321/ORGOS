# ORGOS — Production Readiness Report

Generated: 2026-05-04

## TL;DR
- I scanned manifests and key source files, executed the test suite, and scaffolded a basic CI workflow plus an env validation script.
- All API unit/integration tests pass locally: `apps/api` — 16 tests passed across 10 files.
- Core routing/agent logic, prompt caching, and routing-memory algorithms are implemented and validated by tests.
- Remaining work to reach full production confidence is documented and prioritized below.

## What I inspected
- Root: `package.json`, `README.md`
- API: `apps/api/package.json`, `apps/api/src/services/agentService.ts`, `apps/api/src/services/routingMemory.ts`, `apps/api/src/services/promptCache.ts`, tests under `apps/api/test/`
- Web: `apps/web/package.json` (no E2E tests present)
- Agent core: `packages/agent-core/package.json`
- Shared types: `packages/shared-types`
- Added files during this audit: `.github/workflows/ci.yml`, `scripts/validate-env.sh`, `/memories/session/plan.md` (production plan)

## Test run summary (executed: `npm run test` via Turborepo)
- Turbo ran tests for workspaces: `@orgos/agent-core`, `@orgos/api`, `@orgos/db`, `@orgos/shared-types`, `@orgos/web`.
- `@orgos/api` results: 10 test files, 16 tests — all 16 passed (including `agent-service.test.ts`, `tasks-routing-suggest.integration.test.ts`, `synthesize-worker.integration.test.ts`, `mfa.test.ts`, `notifier.integration.test.ts`, `queue-architecture.integration.test.ts`, `rag-search.test.ts`, `reports-route.integration.test.ts`, `role-workflow.integration.test.ts`, `user-profile.test.ts`).
- Other packages report no tests yet or no-tests placeholders.

## Production-ready areas (already implemented & validated)

- Routing suggestion flow (`suggestRoutingForTask`) — loads task, fetches candidates, builds routing memory, uses cache when available, calls LLM, parses output, validates via Zod, filters allowed assignees. File: `apps/api/src/services/agentService.ts`.
- Routing memory extraction & scoring — algorithm computes `sampleSize` and prioritized `topSignals` by support and average confidence. File: `apps/api/src/services/routingMemory.ts`.
- Prompt caching helpers — deterministic cache keys, defensive Redis calls that no-op when Redis client is absent. File: `apps/api/src/services/promptCache.ts`.
- Defensive handling of missing PostgREST schema-cache responses (PGRST205/PGRST204) to avoid failing during schema rollout.
- Zod schema validation of LLM outputs to ensure shape safety.

## Gaps / What remains to be done (prioritized)

1. End-to-end integration / system tests (High)
   - Create reproducible E2E smoke tests that exercise the full stack: frontend → API → DB → Redis → worker queues → LLM (or stubbed LLM). Use docker-compose or Testcontainers in CI to run ephemeral Postgres + Redis, or run against a dedicated ephemeral Supabase/Upstash test project.

2. Credentials & environment validation (High)
   - Ensure production secrets and roles/permissions are configured in the target cloud environment.
   - Integrate secrets into CI (GitHub Secrets) and/or a secrets manager (HashiCorp Vault / cloud secret manager).
   - `scripts/validate-env.sh` added for CI/local checks; integrate as a required CI step that fails builds without required vars.

3. LLM provider resiliency (High)
   - Audit `@orgos/agent-core` (where `callLLM` is implemented). Add request-timeout, exponential backoff with jitter, circuit-breaker, provider fallback ordering, and cost/latency safeguards if not already present.

4. Observability & telemetry (High)
   - Instrument LLM latency, tokens/usage, cache hit/miss rates, worker retry counts, queue backlog, and request durations.
   - Add structured logging and error reporting (Sentry) and metrics export (Prometheus/Grafana). Ensure CI and runbooks include how to access dashboards/alerts.

5. Security & access controls (High)
   - Perform RBAC and auth plugin audit for all routes to ensure only authorized roles can perform sensitive actions.
   - Add tests that assert unauthorized access is rejected and that role-based flows behave correctly.

6. Deployment CI/CD (High)
   - I scaffolded `.github/workflows/ci.yml` (typecheck → test → build). Replace placeholder steps with pinned action SHAs and add deployment jobs (OIDC auth) for your chosen hosts (Vercel for web, Render/Railway/Cloud Run for API).

7. Typecheck/build of `@orgos/agent-core` artifacts (High)
   - Ensure `packages/agent-core` is built in CI before building `@orgos/api` (CI step ordering). Publish to internal registry or ensure build artifact is present for downstream builds.

8. More test coverage around error cases (Medium)
   - Add tests for: DB schema-cache error handling, LLM invalid JSON responses, LLM 429 / rate-limited behavior, Redis failures (set/get throws), and cache invalidation races.

9. Frontend E2E (Medium)
   - Add Playwright tests for login, socket connectivity, task creation/assignment UIs, and route flows. Run these in CI against a preview/deployed environment or ephemeral local deployment.

10. Redis `KEYS` usage (Medium)
   - `invalidateOrgPromptCache` currently uses `redis.keys`. For production, replace with safer approach (maintain per-org index set on writes, or use SCAN with cursor and small batches).

## Actionable next steps (concrete, ordered)

1. Merge CI workflow and env validation script to main; make CI required for PRs. (I added `.github/workflows/ci.yml` and `scripts/validate-env.sh`.)
2. Add a CI job to build `packages/agent-core` before `@orgos/api` to ensure types and `dist` exist.
3. Implement LLM resiliency wrapper in `packages/agent-core` with timeouts/backoff/circuit-breaker and emit metrics.
4. Create a reproducible integration environment (docker-compose) for CI smoke tests or configure ephemeral-hosted test instances.
5. Add Playwright E2E tests under `apps/web/tests/e2e` and a CI job to run them against a preview environment.
6. Replace `redis.keys` usage with safer pattern and add tests for cache invalidation.
7. Add monitoring dashboards + alerting playbook for critical failures (LLM errors, high queue backlog, repeated worker failures).

## How to validate (quick commands)

Run tests locally (already executed in this audit):
```bash
npm ci
npm run typecheck
npm run test
```

Validate required env vars (basic):
```bash
bash scripts/validate-env.sh
```

CI notes:
- The scaffolded CI (`.github/workflows/ci.yml`) runs `npm ci`, `npm run typecheck`, `npm run test`, and `npm run build`. Adjust steps for pinned actions and add deployment jobs as needed.

## Files read during audit
- `README.md`
- `package.json` (root)
- `apps/api/package.json`
- `apps/web/package.json`
- `packages/agent-core/package.json`
- `apps/api/src/services/agentService.ts`
- `apps/api/src/services/routingMemory.ts`
- `apps/api/src/services/promptCache.ts`
- `apps/api/test/*` (representative tests, including `agent-service.test.ts`)
- Added: `.github/workflows/ci.yml`, `scripts/validate-env.sh`, `/memories/session/plan.md`, `docs/production-readiness-report.md`

## Closing notes
- Tests executed successfully in this environment: API tests are green. The codebase shows good defensive practices (Zod validation, schema-cache handling, Redis no-ops), but full production confidence requires CI-integrated E2E verification, LLM resiliency measures, observability, secrets management, and some safe Redis key handling.

If you want, I can implement the LLM resiliency wrapper in `packages/agent-core` next, or scaffold Playwright E2E tests for the frontend. Which should I do next?
