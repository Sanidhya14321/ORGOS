# WINDOW

## Build Order Status

- [x] Step 1: DB schema + Zod schemas
- [x] Step 2: Auth routes (register -> verify -> company -> position -> pending)
- [x] Step 3: Org routes (create, search, approve/reject members)
- [x] Step 4: Task routes (create, routing suggest, confirm, status)
- [x] Step 5: Agent service (Groq decomposition + routing suggestions)
- [ ] Step 6: SLA service (cron + breach + notifications)
- [ ] Step 7: Assignment engine (skill match + load balance)
- [ ] Step 8: WebSocket / notifier
- [ ] Step 9: Frontend auth pages
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
