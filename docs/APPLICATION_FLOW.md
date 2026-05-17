# ORGOS — application flow, data plane, UX, AI, and development

This document complements the repository [README](../README.md) with **end-to-end flows** and **Mermaid diagrams**. It reflects the current codebase layout (`apps/api`, `apps/web`, `packages/*`). Paths are relative to the repo root.

---

## 1. Monorepo and runtime boundaries

| Area | Responsibility |
|------|------------------|
| `apps/web` | Next.js 14 App Router, middleware cookie gate, `apiFetch` / forms to API with credentials, Socket.io client, React Query, Zustand |
| `apps/api` | Fastify HTTP API, auth plugin, route modules under `/api`, BullMQ workers, Socket.io on the same Node HTTP server |
| `packages/db` | SQL migrations (apply to Supabase Postgres); RLS may exist but **service-role** API access still requires app-layer `org_id` checks |
| `packages/shared-types` | Shared Zod schemas and types |
| `packages/agent-core` | LLM agents (CEO / manager / worker / synthesis), RAG message helpers, model routing (e.g. Groq + fallback) |

```mermaid
flowchart TB
  subgraph client [Browser]
    Next[Next.js_App_Router]
    MW[middleware_ts]
    Fetch[lib_api_ts]
    SIO[Socket_io_client]
    Next --> MW
    Next --> Fetch
    Next --> SIO
  end

  subgraph api [apps_api]
    F[server_ts_Fastify]
    Auth[plugins_auth_ts]
    R[routes_prefix_api]
    Q[BullMQ_workers]
    IO[notifier_ts_Socket_io]
    F --> Auth
    F --> R
    F --> IO
    Q --> F
  end

  subgraph external [Infrastructure]
    PG[(Supabase_Postgres)]
    SA[Supabase_Auth_JWT]
    RD[(Redis_Upstash_BullMQ)]
    QD[(Qdrant_optional)]
    LLM[LLM_providers]
  end

  Fetch -->|HTTPS_cookie_or_Bearer| F
  SIO -->|WS_same_origin_API| IO
  Auth --> SA
  Auth --> PG
  R --> PG
  Q --> PG
  Q --> RD
  Q --> LLM
  Q --> QD
```

---

## 2. Data flow — browser to persistence

Typical **authenticated** interaction: UI calls REST, API validates token + session + org scope, then reads/writes Postgres via the Supabase **service** client. Long-running work is deferred to **workers** (when Redis is available) or run **inline** (see §5).

```mermaid
sequenceDiagram
  participant U as User_browser
  participant N as Next_middleware
  participant W as Next_page_or_client
  participant A as Fastify_API
  participant Au as auth_plugin
  participant DB as Postgres_service_role
  participant RQ as Redis_BullMQ

  U->>N: Navigate_protected_route
  N->>N: Check_ACCESS_TOKEN_cookie
  alt no_cookie
    N-->>U: Redirect_login
  end
  N->>W: next
  W->>A: HTTP_apiFetch_credentials_include
  A->>Au: onRequest_resolve_user
  Au->>DB: users_sessions_role_org
  alt mutating_non_GET_and_cookie_not_Bearer
    Au->>Au: Origin_must_match_WEB_ORIGIN
  end
  Au-->>A: user_userRole_userOrgId_assertOrgAccess
  A->>DB: Query_or_mutation_scoped_by_org
  alt async_pipeline
    A->>RQ: enqueue_job
    RQ-->>W: optional_UI_refresh_via_socket
  end
  A-->>W: JSON_response
```

**Org isolation:** routes that accept an `org_id` (or derive it from entities) should call `request.assertOrgAccess(targetOrgId)` so a user cannot operate on another organization’s rows. Service-role bypasses RLS, so this check is part of the **data safety** model.

---

## 3. Authentication, session, and CSRF-style origin policy

Implemented in `apps/api/src/plugins/auth.ts`.

- **Token:** `Authorization: Bearer …` and/or `orgos_access_token` cookie.
- **Public routes:** login/register/MFA helpers, org search, health, and some recruitment apply URLs (see `PUBLIC_ROUTES` and `isDynamicPublicRoute`).
- **Non-public routes:** Supabase `getUser`, profile role + `org_id`, optional **MFA** gate for CEO/CFO when enabled.
- **Session row:** when **not** in relaxed local testing mode, a matching `sessions` row is **required**; missing or revoked/expired session → `401`.
- **Origin:** for mutating methods (`POST`, `PUT`, `PATCH`, `DELETE`) without `Bearer` auth, `Origin` must match `WEB_ORIGIN`. `OPTIONS` passes through for CORS preflight. Bearer API clients skip the origin check.

```mermaid
flowchart TD
  T[Request] --> P{Public_route}
  P -->|yes| OK[Allow_or_token_optional]
  P -->|no| O{OPTIONS}
  O -->|yes| E[Early_exit]
  O -->|no| M{Safe_method_GET_HEAD}
  M -->|no| B{Bearer_Auth}
  B -->|no| OR[Origin_matches_WEB_ORIGIN]
  B -->|yes| JWT[Supabase_getUser]
  OR -->|fail| F403[403_Invalid_origin]
  OR -->|ok| JWT
  JWT --> PROF[Load_users_profile]
  PROF --> MFA{CEO_CFO_and_MFA_enabled}
  MFA -->|need_cookie| MFAC[MFA_verified_cookie]
  MFA -->|ok| SESS[Session_row_revoke_idle]
  MFAC --> SESS
  SESS -->|missing_when_strict| F401[401_Session_not_found]
  SESS -->|ok| CTX[Set_assertOrgAccess]
```

**Frontend gate:** `apps/web/middleware.ts` requires the access-token cookie for configured prefixes (`/dashboard`, `/settings`, `/org-setup`, `/onboarding`, etc.). This is **not** a substitute for API authorization; it only steers UX away from protected shells without a cookie.

---

## 4. User experience flow — primary journeys

```mermaid
flowchart LR
  subgraph authz [Account]
    L[Login_register_verify]
    P[Pending_approval]
    AC[Activate_seat]
    CP[Complete_profile]
  end

  subgraph org [Organization]
    ON[Onboarding_CEO]
    OS[Org_setup_milestones]
  end

  subgraph work [Work_surface]
    D[Dashboard_shell]
    G[Goals_tasks_reports]
    K[Knowledge_documents]
  end

  L --> P
  P --> AC
  AC --> CP
  CP --> ON
  ON --> OS
  OS --> D
  D --> G
  D --> K
```

| Stage | What the user sees | Backend / notes |
|-------|---------------------|-----------------|
| Login / register / verify | Auth pages | `/api/auth/*`, Supabase Auth |
| Pending | Waiting for admin approval | Profile `status`, `/api/me` |
| Activate seat | Token link from invite | `/api/auth/activate-seat` |
| Complete profile | Pick org, position, department | Profile updates, hierarchy scope for later RBAC |
| Onboarding (CEO path) | Company structure, positions import | `/api/onboarding/*` |
| Org setup | CEO completes gated milestones (e.g. positions, company docs) | `/api/orgs/:id/setup-milestone`, `org_setup` summary from `/api/me` |
| Dashboard | Role-based nav, realtime refresh | `DashboardShell`, `connectSocket` for WS |
| Goals / tasks | Create goals, watch decomposition, manage execution | Goals + tasks APIs, sockets (`goal:decomposed`, `goal:progress`, task events) |

**Goal proposals (escalation):** managers (and other roles per route rules) can submit proposals; executives approve → creates a goal and triggers decomposition (`apps/api/src/routes/goalProposals.ts`, `apps/api/src/services/orgGraph.ts`).

---

## 5. Goal lifecycle — queue vs inline decomposition

Entry: creating or approving a goal leads to `triggerGoalDecomposition` (`apps/api/src/services/goalDecomposition.ts`).

```mermaid
flowchart TD
  G[Goal_created_or_approved] --> T[triggerGoalDecomposition]
  T --> R{Redis_reachable}
  R -->|yes| Q[Enqueue_csuite_queue]
  R -->|no| I[Inline_processCsuiteDecomposeJob]
  Q --> W1[decompose_csuite_worker]
  I --> CS[processCsuiteDecomposeJob]
  W1 --> CS
  CS --> M[Manager_decompose]
  M --> IA[Individual_ack]
  IA --> EX[Execute]
  EX --> SY[Synthesize_when_applicable]
```

- **Queued path:** BullMQ job → `decompose.csuite.worker` → downstream queues/workers as designed.
- **Inline path (no Redis):** same processor functions are invoked **in-process** with real `enqueueIndividualAck` / `enqueueExecute` callbacks wired to `processIndividualAckJob` and `processExecuteJob`, so task side-effects stay on one logical pipeline.

---

## 6. AI and RAG flow — from documents to agents

**Ingestion (knowledge):**

1. CEO (or allowed role) uploads documents → `POST /api/documents/upload` (`apps/api/src/routes/documents.ts`).
2. File parsed locally → text normalized → optional embedding plan (vector / hybrid / vectorless).
3. Rows stored in Postgres; optional Qdrant upsert via embedding worker path when configured.

**Retrieval (agents):**

- Workers call `ragSearchClient` / retrieval helpers (`apps/api/src/services/ragSearchClient.ts`, `ragRetrieval.ts`, `qdrantVectorStore.ts`) — **not** a separate public HTTP “search” route.
- CEO decomposition may run **dual retrieval** (goal text + policy-augmented query), merge/dedupe, optional keyword rerank (`packages/agent-core` hierarchical agent path).

```mermaid
flowchart TB
  UP[Document_upload_API] --> PARSE[parseLocalFile]
  PARSE --> STORE[(org_documents_Postgres)]
  PARSE --> EMB[embeddingService_ingest_worker]
  EMB --> VEC[(embeddings_chunks)]
  EMB --> QD[(Qdrant_if_enabled)]

  GOAL[Goal_text] --> AG[decompose_execute_workers]
  AG --> RAG[ragSearchClient_retrieve]
  RAG --> VEC
  RAG --> QD
  RAG --> CTX[Augmented_prompt_context]
  CTX --> LLM[agent_core_LLM]
  LLM --> OUT[Structured_tasks_directives]
```

**Optional env:** `ORGOS_CEO_DECOMPOSE_SINGLE_CALL` toggles an experimental single-call CEO path vs hierarchical decomposition (`apps/api/src/config/env.ts`, csuite worker).

---

## 7. Realtime — Socket.io

`apps/api/src/services/notifier.ts` attaches Socket.io to the Fastify HTTP server. Clients authenticate with the same token (cookie or handshake `auth`). Server joins sockets to rooms such as `user:{id}`, `org:{orgId}`, `org:{orgId}:role:{role}`.

**Examples:**

- Task lifecycle events → task invalidation in the web layer (`apps/web/lib/socket.ts`, `useRealtimeQueryInvalidation`).
- `goal:decomposed` → CEO/CFO role rooms (see `emitGoalDecomposed`).
- `goal:progress` → org room via `emitGoalProgress` for broad UI refresh.

The dashboard shell connects the shared socket when entering `/dashboard` so pages like Goals receive events without opening the task board first.

---

## 8. Development and operations flow

```mermaid
flowchart LR
  subgraph dev [Developer_machine]
    I[npm_install]
    E[env_files]
    D[npm_run_dev]
    T[npm_run_typecheck]
    X[npm_run_test]
  end

  subgraph ci [Quality_gates]
    G[guard_schemas]
    TC[Turbo_typecheck]
    API[API_tsx_tests]
  end

  I --> E
  E --> D
  D --> T
  T --> X
  X --> G
  G --> TC
  TC --> API
```

| Command | Purpose |
|---------|---------|
| `npm run dev` | Starts local Redis helper, API (`apps/api`), and web (`apps/web`) — see root `package.json` |
| `npm run typecheck` | Turborepo TypeScript across workspaces |
| `npm run test` | Schema guard + `apps/api` Node test suite (`tsx --test test/**/*.test.ts`) |
| `npm run build` | Production builds via Turborepo |
| `npm run db:apply-remote` / `db:apply-remote-direct` | Apply `packages/db/schema/*.sql` to linked Supabase |

**Environment:** copy `.env.example` patterns into `apps/api` and `apps/web` env files; set `WEB_ORIGIN`, `NEXT_PUBLIC_API_URL`, Supabase keys, Redis URL, and LLM keys as required for the features you exercise.

**Applying new migrations:** after pulling SQL under `packages/db/schema/`, run your chosen apply script against the target database before relying on new columns (for example org setup flags or `goal_proposals`).

---

## 9. Quick reference — mounted API modules

Registered under `/api` in `apps/api/src/server.ts`:

`auth`, `expansion`, `org`, `me`, `goals`, `tasks`, `reports`, `recruitment`, `settings`, `onboarding`, `documents`, `help`, `goal-proposals` (plugin path prefixes vary; see each route file).

Unprefixed: `health`, `metrics`.

---

## 10. Diagram index

| Diagram | Section |
|---------|---------|
| Monorepo / infra | §1 |
| Request + DB sequence | §2 |
| Auth / session / origin | §3 |
| UX stages | §4 |
| Goal decomposition | §5 |
| RAG + agents | §6 |
| Dev workflow | §8 |

For deployment-specific notes, see [PLATFORM_DEPLOY.md](PLATFORM_DEPLOY.md) if present in your checkout.
