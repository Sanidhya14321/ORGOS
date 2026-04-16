# ORGOS — MEMORY

## WHAT THIS PROJECT IS
ORGOS is an AI-powered organizational task management system where tasks flow downward through hierarchy and each assignee can use an agent to decompose work.

## CURRENT STATUS

- Step 1 — Auth & Registration [ ] NOT STARTED
- Step 2 — Approval Dashboard [ ] NOT STARTED
- Step 3 — Org Tree Visualization [ ] NOT STARTED
- Step 4 — Task Creation & Routing [ ] NOT STARTED
- Step 5 — SLA Tracking [ ] NOT STARTED
- Step 6 — Load & Skill Matching [ ] NOT STARTED

## BUILD ORDER TRACKER

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

## WHAT HAS BEEN DONE
- Introduced tracking files (`WINDOW.md`, `MEMORY.md`).
- Added DB migration and shared schema groundwork for org/position/task-routing entities.
- Added auth endpoints for verification and profile completion.
- Updated registration to verification-first response (`requiresVerification`).
- Added organization routes for search/create/positions and member approval decisions.
- Added task create/routing-suggest/routing-confirm backend route flow.
- Added `agentService` and wired auto-generated routing suggestions through agent-core LLM routing.
- Added SLA monitor service with periodic status checks, breach notifications, and audit logging.
- Upgraded assignment engine with weighted skill/load ranking and active-candidate filtering.
- Hardened WebSocket notifier with user/role/org rooms and task lifecycle realtime events.
- Implemented frontend onboarding flow pages for verify, complete-profile, and pending approval.

## KNOWN ISSUES
- Remote Supabase instance has intermittently missing schema-cache entries for tables.
- API has defensive fallbacks for missing table cache in select paths.

## SESSION LOG
- 2026-04-11 — Initialized project trackers and completed Step 1 foundation updates.
- 2026-04-11 — Implemented Step 2 auth-route flow updates and public verify routing.
- 2026-04-11 — Implemented Step 3 org route scaffold and integrated it into the API server.
- 2026-04-11 — Implemented Step 4 task-route lifecycle for routing and confirmation.
- 2026-04-11 — Implemented Step 5 agent routing suggestion service and integrated it into task routing flow.
- 2026-04-11 — Implemented Step 6 SLA monitor service and integrated lifecycle startup/shutdown.
- 2026-04-11 — Implemented Step 7 assignment scoring upgrades (skills + load + org scope).
- 2026-04-11 — Implemented Step 8 notifier hardening with room namespaces and task event emissions.
- 2026-04-11 — Implemented Step 9 frontend auth/onboarding page flow and middleware updates.
