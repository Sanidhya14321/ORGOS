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
- [ ] Step 10: Frontend CEO approval dashboard
- [ ] Step 11: Frontend org tree (React Flow)
- [ ] Step 12: Frontend task board (role-aware)
- [ ] Step 13: Routing memory + Groq history context
- [ ] Step 14: Tests + hardening

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
