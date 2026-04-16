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
