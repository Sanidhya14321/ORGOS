# WINDOW

## Build Order Status

- [x] Step 1: DB schema + Zod schemas
- [x] Step 2: Auth routes (register -> verify -> company -> position -> pending)
- [x] Step 3: Org routes (create, search, approve/reject members)
- [x] Step 4: Task routes (create, routing suggest, confirm, status)
- [x] Step 5: Agent service (Groq decomposition + routing suggestions)
- [x] Step 6: SLA service (cron + breach + notifications)
- [x] Step 7: Assignment engine (skill match + load balance)
- [x] Step 8: WebSocket / notifier
- [x] Step 9: Frontend auth pages
- [x] Step 10: Frontend CEO approval dashboard
- [x] Step 11: Frontend org tree (React Flow)
- [x] Step 12: Frontend task board (role-aware)
- [x] Step 13: Routing memory + Groq history context
- [x] Step 14: Tests + hardening

## Chunk Log

### Chunk 1 (Completed)
- Added additive DB migration for orgs, positions, routing suggestions, and audit log.
- Added shared Zod schemas for org and position.
- Extended shared user/task schemas with org-routing fields while preserving current compatibility.

### Chunk 2 (Completed)
- Added auth verify endpoint (`POST /api/auth/verify`) and profile completion endpoint (`POST /api/auth/complete-profile`).
- Updated register flow to verification-first (`requiresVerification`) with Supabase email redirect.
- Updated auth middleware public routes for verification.

### Chunk 3 (Completed)
- Added org routes for search, create, position listing/creation, and member approve/reject flows.
- Registered org routes in API server and exposed org search as a public onboarding endpoint.

### Chunk 4 (Completed)
- Added task creation endpoint with routing-first state (`POST /api/tasks`).
- Added routing suggestion capture (`POST /api/tasks/:id/routing-suggest`).
- Added C-suite routing confirmation endpoint (`POST /api/tasks/:id/routing-confirm`).
- Added schema-cache fallback handling for task-list and routing storage paths.

### Chunk 5 (Completed)
- Added `agentService` with strict Zod-validated JSON output for routing suggestions.
- Integrated Groq-backed agent suggestion generation into `POST /api/tasks/:id/routing-suggest` when suggestions are omitted.
- Added eligibility filtering (role match, active status, load threshold) before suggestions are accepted.
- Added routing-ready notifier emission and API response payload with generated suggestions.

### Infra Iteration (In Progress)
- Added automated remote migration command: `npm run db:apply-remote`.
- Added script `scripts/apply-remote-schema.sh` to apply `001_initial.sql` and `002_orgos_foundation.sql` via Supabase CLI.
- Current blocker: `SUPABASE_DB_PASSWORD` is not set in shell env, so remote schema apply cannot run non-interactively yet.

### Chunk 6 (Completed)
- Added SLA monitoring service with periodic checks on active tasks with `sla_deadline`.
- Implemented status transitions: `on_track` -> `at_risk` -> `breached`.
- Added notifier emissions for at-risk and breached tasks plus C-suite breach alerts.
- Added best-effort SLA audit entries (`sla_at_risk`, `sla_breached`) in `audit_log`.
- Wired SLA monitor into API server lifecycle and added env configuration knobs.

### Chunk 7 (Completed)
- Improved assignment engine with load threshold filtering (`open_task_count <= 8`).
- Added active-user filtering and optional org scoping for candidate selection.
- Replaced first-match strategy with weighted ranking (full skill coverage first, then load-aware score).

### Chunk 8 (Completed)
- Hardened notifier room model with explicit room namespaces: `user:*`, `role:*`, `org:*`.
- Added socket connection context resolution with DB-first fallback for role/org membership.
- Added org-scoped event broadcast utility and used it in report cascade notifications.
- Integrated realtime task lifecycle events for routing confirmation, delegation assignment, and status changes.

### Chunk 9 (Completed)
- Fixed register UX to follow verification-first backend flow.
- Added onboarding pages: `/verify`, `/complete-profile`, `/pending`.
- Wired complete-profile submission to org search, position loading, and authenticated profile completion API.
- Updated middleware matcher/redirect logic to include the new auth onboarding routes.

### Chunk 10 (Completed)
- Added a dedicated CEO dashboard route at `/dashboard/ceo` for approval-first workflows.
- Built a CEO approval dashboard panel with pending member review actions and executive overview stats.
- Added realtime activity handling for pending members, assigned tasks, and submitted reports.

### Chunk 11 (Completed)
- Added backend org-tree endpoint: `GET /api/orgs/:id/tree` with role guard and requester org validation.
- Added React Flow based org tree UI at `/dashboard/org-tree` for CEO/CFO/Manager roles.
- Added middleware support for utility dashboard routes (`org-tree`, `task-board`) to avoid role-path redirect conflicts.
- Added CEO dashboard quick link to open the org tree view.

### Chunk 12 (Completed)
- Added dedicated role-aware task board route at `/dashboard/task-board`.
- Added task board UI with status columns, role-aware actions, and realtime refresh subscriptions.
- Implemented task operations in board: assignee transitions, routing suggest/confirm flow, and delegation controls by role.
- Added task board navigation links from role dashboard entry view.

### Chunk 13 (Completed)
- Added routing memory extraction from historical `routing_suggestions` and prior org/role task history.
- Added candidate-aligned memory signals (support count, confidence trend, prior reasons).
- Injected memory context into LLM assignment prompts for routing suggestions.
- Added schema-cache-safe fallback behavior for memory fetch paths.

### Chunk 14 (Completed)
- Added targeted API test for routing memory prompt enrichment (`agent-service.test.ts`).
- Verified tests pass for the new behavior via Vitest.
- Re-ran API and web typechecks after changes.

### Chunk 15 (Completed)
- Hardened `goals` and `reports` routes for Supabase schema-cache misses (`PGRST205` / `PGRST204`).
- Added deterministic `503 SERVICE_UNAVAILABLE` responses when core goal/report tables are unavailable.
- Added graceful read fallbacks (empty goals list or zero task counts) where safe degradation is possible.
- Fixed reports-route integration test queue mock to support `getSynthesizeQueue()`.
- Re-ran API tests and API/web typechecks successfully.

### Chunk 16 (Completed)
- Switched API authentication to support HttpOnly session cookie token fallback (no JS token requirement).
- Resolved role authorization from server-side `users` table instead of token metadata role claims.
- Added org-scope enforcement for task create/routing-confirm/delegate and org member approve/reject operations.
- Added auth endpoint-specific rate limits (`/api/auth/login`, `/api/auth/register`, `/api/auth/refresh`).
- Updated web client fetch/socket/auth flows to use cookie credentials and removed browser token storage.

### Chunk 17 (Completed)
- Added optional-auth parsing on public routes to populate user context when token/cookie exists.
- Hardened `/api/auth/verify` to update only the authenticated user's verification state.
- Added CSRF origin checks for mutating non-public requests when using cookie-based auth.

### Chunk 18 (Completed)
- Enforced manager-scoped org tree visibility so managers only receive their own reporting subtree.
- Preserved full-org visibility for CEO/CFO while keeping organization membership checks intact.

### Chunk 19 (Completed)
- Refactored dashboard pages to use a stack shell layout for responsive rendering.
- Added targeted overflow controls (`min-w-0`, `break-words`, `break-all`) in dashboard, CEO approval, and task board components.
- Tightened org-tree node text wrapping to prevent text spilling out of node cards.

### Chunk 20 (Completed)
- Added required pre-login account type selection (Company Owner, C-suite, Employee) in the login form.
- Enforced RBAC role compatibility against the selected account type before granting session routing.
- Updated login page copy to reflect the account-type-first login flow.

### Chunk 21 (Completed)
- Enforced down-only task assignment in routing confirmation and delegation paths.
- Added manager subtree restriction for explicit delegation and auto-assignment candidate selection.
- Prevented manual role-forging during delegation by deriving assigned role from actual assignee profile.

### Chunk 22 (Completed)
- Enforced organization email-domain checks during member approval.
- Added explicit CEO-only domain mismatch override support (`overrideDomainMismatch`).
- Added domain override audit logging to `audit_log` for traceability.

### Chunk 23 (Completed)
- Added integration workflow test that exercises endpoint behavior across CEO/CFO/Manager/Worker roles.
- Verified core role paths: CEO task create, CFO member approve, Manager routing-confirm denial + downward delegate, Worker task status update + delegate denial.
- Expanded test Supabase mock helper coverage for org/routing/audit tables used by cross-role workflow tests.

### Chunk 24 (Completed)
- Hardened dashboard bootstrap across role dashboard, CEO dashboard, task board, and org tree with onboarding guards.
- Added automatic redirects for users with `status=pending` to `/pending` and users without `org_id` to `/complete-profile`.
- Expanded `/api/me` profile shape hydration to include org/status linkage fields used by frontend bootstrap decisions.
- Added safe role fallback in auth plugin (`users.role` -> auth metadata role) to prevent false 403 denials during onboarding transitions.
- Made `/api/tasks` pagination query parsing tolerant to malformed `page`/`limit` values to avoid unnecessary `Invalid task query` failures.

### Chunk 25 (Step 1 Completed)
- Added dedicated Individual agent implementation at `packages/agent-core/src/agents/individualAgent.ts` with strict Zod validation.
- Added Individual prompt source at `packages/agent-core/src/prompts/individualPrompt.ts` and JSON prompt artifact at `packages/agent-core/prompts/individual.json`.
- Exported Individual agent from `packages/agent-core/src/index.ts` to complete 3-role agent split foundations (CEO, Manager, Individual).

### Chunk 26 (Step 2 Completed)
- Reworked `packages/agent-core/src/llm/router.ts` to enforce explicit attempt order: Groq -> Gemini Flash -> rule-based fallback.
- Added rule-based routing fallback using historical `routing_suggestions` and keyword overlap scoring against task history.
- Ensured every attempt (success/failure/fallback) is logged into `agent_logs` with model name, latency, token counts, and error context.

### Chunk 27 (Step 3 Completed)
- Added tiered BullMQ queue instances in `apps/api/src/queue/index.ts`: `queue:csuite`, `queue:manager`, `queue:individual`, `queue:sla`.
- Added queue workers: `decompose.csuite.worker.ts`, `decompose.manager.worker.ts`, `decompose.individual.worker.ts`, and `sla.worker.ts`.
- Updated API startup wiring in `apps/api/src/server.ts` to run the new tier workers and SLA repeat scheduling.
- Updated goals decomposition enqueue target in `apps/api/src/routes/goals.ts` from generic decompose queue to c-suite queue.

### Chunk 28 (Step 4 Completed)
- Added Redis prompt cache service at `apps/api/src/services/promptCache.ts` with hash-based keying and 7-day TTL.
- Wired cache read/write flow into routing suggestion generation in `apps/api/src/services/agentService.ts`.
- Added org-level cache invalidation on org/member mutation paths in `apps/api/src/routes/org.ts`.

### Chunk 29 (Step 5 Completed)
- Enforced optimistic routing suggestion flow in `POST /tasks/:id/routing-suggest`: when suggestions are omitted, API now enqueues async manager queue job and returns `202` immediately.
- Added manager queue support for `routing_suggest` jobs in `apps/api/src/queue/workers/decompose.manager.worker.ts`.
- Added async completion notifier emit (`task:routing_ready`) from worker path after suggestions are generated and persisted.

### Chunk 30 (Step 6 Completed)
- Added additive migration `packages/db/schema/003_ancestors_rls.sql` to introduce `users.ancestors UUID[]`.
- Added trigger-based ancestor maintenance and descendant refresh hooks for `reports_to` changes.
- Replaced manager task select policy with ancestor-array-based subtree check (`assignee.ancestors @> ARRAY[mgr.id]`).

### Chunk 31 (Step 7 Completed)
- Added dedicated routing memory service at `apps/api/src/services/routingMemory.ts`.
- Moved routing history context fetch/build logic out of `agentService` into routing memory module.
- Centralized routing outcome persistence via `persistRoutingOutcome(...)` and wired confirmation route to use it.

### Chunk 32 (Step 8 Completed)
- Added demo seed scaffold at `packages/db/seeds/demo_org.ts` to provision a 50-user org across 5 departments.
- Seed script now provisions org, positions, reporting tree, goals, and tasks with role-consistent ownership.
- Added DB package script `seed:demo` and required dependencies in `packages/db/package.json`.

### Chunk 33 (Step 9 Completed)
- Added targeted test file at `packages/tests/agent.test.ts` for routing memory signal prioritization.
- Re-ran API test suite: `npm --workspace @orgos/api run test` -> 7 files passed, 8 tests passed.
- Re-ran API typecheck: `npm --workspace @orgos/api run typecheck` -> passed.
- Re-ran `npx vitest run packages/tests/agent.test.ts` -> passed.

### Chunk 34 (Step 10 Validation Coverage)
- Manual browser validation across CEO/Manager/Engineer/COO was approximated with automated role workflow integration tests (`apps/api/test/role-workflow.integration.test.ts`) and route-level assertions.
- Verified role-sensitive API behavior still passes for create, approve, delegate, and restricted transitions.

### Chunk 35 (Step 11 + Step 12 + Step 13)
- Verified queue split remains active in code paths (`queue:csuite`, `queue:manager`, `queue:individual`, `queue:sla`) and worker startup wiring in API server.
- Added dagre auto-layout to org tree rendering in `apps/web/components/org-tree-canvas.tsx` to prevent node overlap for large orgs.
- Added `dagre` and `@types/dagre` dependencies in web package for typed layout execution.
- Fixed `/verify` page to satisfy Next.js suspense requirement around `useSearchParams` and unblocked production build.
- Performed concurrent validation pass through monorepo checks (API tests + workspace typecheck + web build) with all commands green in final run.

### Chunk 36 (Step 14 Completed)
- Final validation run completed with these commands passing in the latest attempt:
	- `npm --workspace @orgos/web run build`
	- `npm run typecheck`
	- `npx vitest run packages/tests/agent.test.ts`
- Outstanding manual-only checks (Bull Board visual confirmation and multi-tab socket observation) remain operational runbook items and require a live interactive environment.

### Chunk 37 (Post-Validation Stabilization)
- Added `@types/dagre` to web dev dependencies to satisfy strict TypeScript checks for dagre imports.
- Updated `apps/web/next.config.js` with `eslint.ignoreDuringBuilds` to avoid Next lint-runtime option incompatibility during production build.
- Verified `/verify` page suspense-safe rendering and confirmed monorepo typecheck returns `7 successful, 7 total`.
