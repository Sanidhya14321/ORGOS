# ORGOS — MEMORY

## WHAT THIS PROJECT IS
ORGOS is an AI-powered organizational task management system where tasks flow downward through hierarchy and each assignee can use an agent to decompose work.

## CURRENT STATUS

- Build roadmap Steps 1–14 [x] COMPLETED
- Post-roadmap schema-cache hardening [x] COMPLETED

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
- [x] Step 10: Frontend CEO approval dashboard
- [x] Step 11: Frontend org tree (React Flow)
- [x] Step 12: Frontend task board (role-aware)
- [x] Step 13: Routing memory + Groq history context
- [x] Step 14: Tests + hardening

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
- Added dedicated CEO approval dashboard route with pending member review and realtime activity.
- Added org tree route with React Flow visualization and backend org hierarchy endpoint.
- Added role-aware task board with realtime updates and lifecycle actions (routing/delegation/status).
- Added routing memory context in agent routing suggestions using historical decisions.
- Added focused API tests and validation pass for routing memory/hardening behavior.
- Added routing memory signals from historical suggestions into LLM routing context.
- Hardened WebSocket notifier with user/role/org rooms and task lifecycle realtime events.
- Implemented frontend onboarding flow pages for verify, complete-profile, and pending approval.
- Hardened goals/reports routes for Supabase schema-cache misses with explicit 503 behavior and safe read fallbacks.
- Updated reports integration test queue mock for `getSynthesizeQueue()` and revalidated full API tests.
- Hardened OWASP-priority auth/access controls: server-authoritative role resolution, org-scoped mutation checks, and HttpOnly cookie auth.
- Removed browser bearer-token handling from web fetch/socket/profile flows and added auth-route rate limiting.
- Added optional auth context on public routes and secured verify flow to authenticated user identity.
- Added CSRF origin validation for cookie-authenticated mutating API requests.
- Enforced manager org-tree visibility to subtree-only scope while keeping full view for CEO/CFO.
- Improved dashboard responsiveness and overflow handling across shell, task board, org tree, and approval views.
- Added account-type-first login flow with RBAC compatibility checks (owner / C-suite / employee).
- Enforced down-only task assignment with manager-subtree constraints in routing/delegation flows.
- Enforced member approval email-domain policy with CEO-only override and audit logging.
- Added end-to-end role workflow integration coverage for CEO/CFO/Manager/Worker endpoint paths.
- Hardened all dashboard bootstraps to redirect unlinked/pending users to onboarding flows instead of surfacing permission bootstrap crashes.
- Added auth role fallback (profile role -> metadata role) and richer `/api/me` profile hydration for safer onboarding-aware routing.
- Made task list query parsing resilient to malformed page/limit values.

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
- 2026-04-11 — Implemented Step 10 CEO approval dashboard route and realtime approval workflow.
- 2026-04-11 — Implemented Step 11 org tree backend endpoint and React Flow dashboard view.
- 2026-04-11 — Implemented Step 12 role-aware task board route and action controls.
- 2026-04-11 — Implemented Step 13 routing memory context for Groq routing prompts.
- 2026-04-11 — Implemented Step 14 tests and hardening checks.
- 2026-04-11 — Implemented Step 13 routing memory context for Groq assignment prompts.
- 2026-04-11 — Implemented Step 8 notifier hardening with room namespaces and task event emissions.
- 2026-04-11 — Implemented Step 9 frontend auth/onboarding page flow and middleware updates.
- 2026-04-16 — Implemented post-roadmap schema-cache hardening for goals/reports routes and restored full API test pass.
- 2026-04-16 — Implemented OWASP remediation pass for access control, session handling, and auth throttling.
- 2026-04-16 — Added verify-route identity binding and CSRF origin checks for cookie-auth mutation paths.
- 2026-04-16 — Enforced manager subtree-only visibility in org tree API responses.
- 2026-04-16 — Implemented responsive dashboard overflow fixes and RBAC account-type login gating.
- 2026-04-16 — Enforced down-only assignment rules with subtree-safe manager auto-delegation.
- 2026-04-16 — Added org-domain enforcement in member approvals with CEO override path.
- 2026-04-16 — Added integration test coverage for cross-role endpoint workflow behavior.
- 2026-04-16 — Implemented full onboarding-safe dashboard bootstrap guards and API role/profile/query resilience fixes.
