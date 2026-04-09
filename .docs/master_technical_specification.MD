# ORGOS — AI Organizational Operating System
### Master Technical Specification & Developer Reference
> Version 1.0 · April 2025 · Internal / Copilot Build Guide

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Complete Tech Stack](#2-complete-tech-stack)
3. [Repository Structure](#3-repository-structure)
4. [Complete Database Schema](#4-complete-database-schema)
5. [API Reference](#5-api-reference)
6. [Agent Architecture](#6-agent-architecture-deep-dive)
7. [Goal Decomposition Flow](#7-goal-decomposition-flow-step-by-step)
8. [Security Implementation](#8-security-implementation-guide)
9. [Error Handling Reference](#9-error-handling-reference)
10. [Environment Variables](#10-environment-variables)
11. [Non-Functional Requirements](#11-non-functional-requirements--targets)

---

## 1. Project Overview

ORGOS is a full-stack, AI-powered Organizational Operating System that bridges the gap between high-level executive strategy and ground-level task execution. It uses a hierarchical multi-agent AI architecture to decompose goals into structured task trees, route work through an org-chart hierarchy, and roll results back up through automated report aggregation.

> **Core Proposition:** ORGOS is NOT a to-do app. It is a living strategy execution engine where every task knows its reason for existence, traced back to the original executive goal through an immutable audit chain.

### 1.1 What Makes ORGOS Different

| Traditional PM Tools | ORGOS |
|---|---|
| Flat task lists with no context | Goal → Directive → Task lineage on every card |
| Manual task creation by managers | AI decomposes goals into task trees in < 8 seconds |
| No role-based propagation | Tasks auto-route from CEO to Manager to Worker |
| Reports are free-form text | Structured JSON reports with schema validation |
| No AI fill-in for vacancies | Agent fallback executes tasks when no human assigned |
| Static; no upward roll-up | Synthesis Agent aggregates sub-reports automatically |

### 1.2 User Roles & Permissions Summary

| Role | Can Create Goals | Can Decompose | Can Execute Tasks | Can View Reports | Can Admin |
|---|---|---|---|---|---|
| CEO / CFO | ✅ Yes | ✅ Via Agent | ❌ No | ✅ All Org | ✅ Yes |
| Manager | ❌ No | ✅ Yes (dept) | ✅ Their tasks | ✅ Dept only | ❌ No |
| Worker | ❌ No | ❌ No | ✅ Yes | ✅ Own only | ❌ No |
| AI Agent | ❌ No | ✅ Manager tier | ✅ Leaf tasks | ✅ Task scope | ❌ No |

---

## 2. Complete Tech Stack

Every component is free-tier, open-source, or has a generous free quota covering an MVP with up to ~1,000 daily active users.

### 2.1 Frontend

| Layer | Technology | Version | Why This Choice | Free Tier Limit |
|---|---|---|---|---|
| Framework | Next.js | 14 (App Router) | SSR, file-based routing, API routes co-located | Vercel free — unlimited deploys |
| UI Components | shadcn/ui | Latest | Unstyled, composable, Tailwind-native | Open source, no limit |
| Styling | Tailwind CSS | 3.x | Utility-first, zero runtime CSS | Open source |
| State | Zustand | 4.x | Minimal boilerplate; no Context hell | Open source |
| Charts | Recharts | 2.x | React-native, responsive SVG charts | Open source |
| Real-time | Socket.io-client | 4.x | Pairs with Socket.io server; reconnect built in | Open source |
| Hosting | Vercel | — | Auto-deploy from GitHub; edge CDN | 100 GB bandwidth/month |

### 2.2 Backend

| Layer | Technology | Version | Notes |
|---|---|---|---|
| Runtime | Node.js | 20 LTS | LTS stability; native fetch; ESM support |
| API Framework | Fastify | 4.x | 3× faster than Express; JSON schema validation built-in; TypeScript-first |
| Auth | Supabase Auth | Latest | JWT + OAuth (Google). RBAC via role claim in JWT |
| Job Queue | BullMQ | 5.x | Redis-backed; retry with exponential backoff; dead-letter queue |
| WebSocket | Socket.io | 4.x | Rooms per user; graceful reconnect |
| Validation | Zod | 3.x | Runtime type safety; used for API inputs AND LLM output validation |
| ORM | Supabase JS Client | 2.x | Auto-generated types from DB schema; RLS-aware |
| Hosting | Render.com | — | 750 hrs free compute/month; auto-sleep mitigated by UptimeRobot |

### 2.3 LLM / AI Layer

| Role | Model | Provider | Free Quota | Latency | When Used |
|---|---|---|---|---|---|
| Primary LLM | LLaMA 3.1 70B | Groq API | 30 req/min | ~3–6s | Goal decomposition, task generation, worker execution |
| Fallback LLM | Gemini 1.5 Flash | Google AI | 1,500 req/day | ~2–4s | When Groq rate-limit hit or timeout |
| Embeddings | all-MiniLM-L6-v2 | HuggingFace Inference | ~1,000/day | ~1s | Semantic dedup of tasks (future) |
| Orchestrator | Custom (no LangChain) | In-house | N/A | 0ms overhead | Controls retry, fallback, schema validation |

### 2.4 Database & Storage

| Component | Technology | Free Tier | Key Features |
|---|---|---|---|
| Primary DB | Supabase PostgreSQL | 500 MB storage | RLS, real-time subscriptions, REST + SDK |
| Cache | Upstash Redis | 10,000 cmds/day | BullMQ backing; task state; rate limit counters |
| File Storage | Supabase Storage | 1 GB | Report attachments; presigned URLs |
| Search | PostgreSQL tsvector | Built-in | Full-text search on tasks/goals; no extra service |
| Migrations | Supabase CLI | Free | Version-controlled schema; rollback support |

### 2.5 Monthly Cost Breakdown (MVP, 0–500 users)

| Service | Free Tier Limit | Overage / Upgrade |
|---|---|---|
| Vercel | 100 GB bandwidth, unlimited deploys | $20/mo Pro |
| Render.com | 750 hrs compute/mo | $7/mo Starter |
| Supabase | 500 MB DB, 1 GB storage | $25/mo Pro |
| Upstash Redis | 10,000 cmd/day | $0.20 per 100K cmd |
| Groq API | 30 req/min free | $0.05–0.09 per 1M tokens |
| Gemini Flash | 1,500 req/day free | $0.075 per 1M tokens |
| **Total MVP Cost** | **$0/month** | **< $30/mo at 500 active users** |

---

## 3. Repository Structure

ORGOS uses a Turborepo monorepo. Every package has a single responsibility. **Never put agent logic in the API layer; never put database calls in the frontend.**

```
orgos/                              ← Turborepo monorepo root
├── apps/
│   ├── web/                        ← Next.js 14 frontend (Vercel)
│   │   ├── app/                    ← App Router pages
│   │   │   ├── (auth)/             ← Login / register routes
│   │   │   ├── dashboard/          ← Main user dashboard
│   │   │   ├── goals/              ← Goal management (exec only)
│   │   │   ├── tasks/              ← Task views (role-filtered)
│   │   │   └── admin/              ← Agent logs, audit (admin only)
│   │   ├── components/             ← Shared React components
│   │   │   ├── GoalCreator.tsx     ← Goal input form with clarification
│   │   │   ├── TaskCard.tsx        ← Task card with lineage trail
│   │   │   ├── TaskTree.tsx        ← Visual tree of goal→tasks
│   │   │   ├── ReportForm.tsx      ← Structured report submission
│   │   │   └── AgentStatus.tsx     ← Real-time agent activity indicator
│   │   ├── lib/
│   │   │   ├── supabase.ts         ← Supabase client (browser)
│   │   │   └── socket.ts           ← Socket.io client singleton
│   │   └── middleware.ts           ← Next.js auth middleware (JWT check)
│   │
│   └── api/                        ← Fastify API server (Render.com)
│       └── src/
│           ├── server.ts           ← Fastify app bootstrap
│           ├── plugins/
│           │   ├── auth.ts         ← JWT verification plugin
│           │   ├── rbac.ts         ← Role-Based Access Control
│           │   └── rateLimit.ts    ← Per-user rate limiting
│           ├── routes/
│           │   ├── auth.ts         ← POST /api/auth/login
│           │   ├── goals.ts        ← CRUD + simulate
│           │   ├── tasks.ts        ← Task CRUD + delegate
│           │   ├── reports.ts      ← Report submit + fetch
│           │   └── admin.ts        ← Agent logs endpoint
│           ├── services/
│           │   ├── goalEngine.ts       ← Orchestrates decomposition
│           │   ├── assignmentEngine.ts ← User/agent assignment logic
│           │   ├── reportAggregator.ts ← Triggers synthesis agent
│           │   └── notifier.ts         ← WebSocket event emitter
│           └── queue/
│               ├── index.ts        ← BullMQ queue definitions
│               └── workers/
│                   ├── decompose.worker.ts   ← Goal → task tree
│                   ├── execute.worker.ts     ← Worker agent jobs
│                   └── synthesize.worker.ts  ← Report aggregation
│
├── packages/
│   ├── agent-core/                 ← ALL AI agent logic lives here
│   │   ├── agents/
│   │   │   ├── ceoAgent.ts         ← Executive goal structuring
│   │   │   ├── managerAgent.ts     ← Sub-directive → task breakdown
│   │   │   ├── workerAgent.ts      ← Autonomous leaf-task execution
│   │   │   └── synthesisAgent.ts   ← Multi-report aggregation
│   │   ├── llm/
│   │   │   ├── provider.ts         ← LLMProvider interface
│   │   │   ├── groq.ts             ← Groq implementation
│   │   │   ├── gemini.ts           ← Gemini fallback
│   │   │   └── router.ts           ← Primary → fallback switching
│   │   ├── prompts/                ← All system prompts as JSON
│   │   │   ├── ceo.json
│   │   │   ├── manager.json
│   │   │   ├── worker.json
│   │   │   └── synthesis.json
│   │   └── tools/                  ← Agent tool implementations
│   │       ├── webSearch.ts
│   │       ├── readOrgChart.ts
│   │       └── readInternalData.ts
│   │
│   ├── db/                         ← Database layer
│   │   ├── schema/
│   │   │   └── 001_initial.sql     ← Full schema + RLS policies
│   │   ├── types/                  ← Auto-generated Supabase types
│   │   └── migrations/             ← Supabase CLI migrations
│   │
│   └── shared-types/               ← Zod schemas shared by all apps
│       ├── goal.schema.ts
│       ├── task.schema.ts
│       ├── report.schema.ts
│       └── agent.schema.ts
│
├── .github/workflows/
│   ├── ci.yml                      ← Lint + typecheck + test on PR
│   └── deploy.yml                  ← Deploy to Vercel + Render on main push
│
├── turbo.json                      ← Turborepo pipeline config
└── package.json                    ← Workspace root
```

---

## 4. Complete Database Schema

All tables reside in Supabase PostgreSQL. **Row-Level Security (RLS) is MANDATORY on every table. Never disable RLS.**

> ⚠️ **CRITICAL:** The `service_role` key bypasses RLS. Only use it in server-side API workers. The `anon` key must never reach protected tables without RLS policies in place.

### 4.1 `users` Table

```sql
CREATE TABLE public.users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email          TEXT UNIQUE NOT NULL,
  full_name      TEXT NOT NULL,
  role           TEXT NOT NULL CHECK (role IN ('ceo','cfo','manager','worker')),
  department     TEXT,
  skills         TEXT[],           -- e.g. ['data-analysis','logistics']
  agent_enabled  BOOLEAN DEFAULT true,
  open_task_count INT DEFAULT 0,   -- denormalized; updated by trigger
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY users_select_own ON public.users
  FOR SELECT USING (auth.uid() = id);

-- Execs/admins can read all users (for assignment engine)
CREATE POLICY users_select_admin ON public.users
  FOR SELECT USING (
    (SELECT role FROM public.users WHERE id = auth.uid()) IN ('ceo','cfo')
  );
```

### 4.2 `goals` Table

```sql
CREATE TABLE public.goals (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by     UUID NOT NULL REFERENCES public.users(id),
  title          TEXT NOT NULL,
  description    TEXT,
  raw_input      TEXT NOT NULL,   -- original NL input before AI processing
  status         TEXT NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active','paused','completed','cancelled')),
  priority       TEXT NOT NULL DEFAULT 'medium'
                   CHECK (priority IN ('low','medium','high','critical')),
  kpi            TEXT,            -- AI-extracted KPI string
  deadline       DATE,
  simulation     BOOLEAN DEFAULT false,  -- true = dry-run; tasks not committed
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;

-- Only execs can create goals
CREATE POLICY goals_insert_exec ON public.goals
  FOR INSERT WITH CHECK (
    (SELECT role FROM public.users WHERE id = auth.uid()) IN ('ceo','cfo')
  );

-- Everyone can read goals (task context)
CREATE POLICY goals_select_all ON public.goals
  FOR SELECT USING (true);
```

### 4.3 `tasks` Table

```sql
CREATE TABLE public.tasks (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id        UUID NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  parent_id      UUID REFERENCES public.tasks(id),   -- NULL = root directive
  depth          INT NOT NULL DEFAULT 0,             -- 0=directive, 1=task, 2=subtask
  title          TEXT NOT NULL,
  description    TEXT,
  success_criteria TEXT,
  assigned_to    UUID REFERENCES public.users(id),   -- NULL = agent fallback
  assigned_role  TEXT NOT NULL,
  is_agent_task  BOOLEAN DEFAULT false,
  status         TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','in_progress','blocked','completed','cancelled')),
  deadline       TIMESTAMPTZ,
  report_id      UUID REFERENCES public.reports(id),
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- Users see only their own tasks
CREATE POLICY tasks_select_own ON public.tasks
  FOR SELECT USING (assigned_to = auth.uid());

-- Managers see all dept tasks
CREATE POLICY tasks_select_manager ON public.tasks
  FOR SELECT USING (
    (SELECT role FROM public.users WHERE id = auth.uid()) = 'manager'
    AND assigned_to IN (
      SELECT id FROM public.users WHERE department = (
        SELECT department FROM public.users WHERE id = auth.uid()
      )
    )
  );

-- Execs see everything
CREATE POLICY tasks_select_exec ON public.tasks
  FOR SELECT USING (
    (SELECT role FROM public.users WHERE id = auth.uid()) IN ('ceo','cfo')
  );

-- Required indexes
CREATE INDEX idx_tasks_assigned_to ON public.tasks(assigned_to, status);
CREATE INDEX idx_tasks_goal_id     ON public.tasks(goal_id);
CREATE INDEX idx_tasks_status      ON public.tasks(status);
```

### 4.4 `reports` Table

```sql
CREATE TABLE public.reports (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id        UUID NOT NULL REFERENCES public.tasks(id),
  submitted_by   UUID REFERENCES public.users(id),   -- NULL when agent submits
  is_agent       BOOLEAN NOT NULL DEFAULT false,
  status         TEXT NOT NULL
                   CHECK (status IN ('completed','partial','blocked')),
  insight        TEXT NOT NULL,
  data           JSONB NOT NULL DEFAULT '{}',
  confidence     FLOAT CHECK (confidence >= 0 AND confidence <= 1),
  sources        JSONB DEFAULT '[]',   -- [{url, title, accessed}]
  escalate       BOOLEAN DEFAULT false,
  created_at     TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY reports_insert_assignee ON public.reports
  FOR INSERT WITH CHECK (
    task_id IN (SELECT id FROM public.tasks WHERE assigned_to = auth.uid())
  );
```

### 4.5 `agent_logs` Table

```sql
CREATE TABLE public.agent_logs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_type     TEXT NOT NULL
                   CHECK (agent_type IN ('ceo_agent','manager_agent','worker_agent','synthesis_agent')),
  task_id        UUID REFERENCES public.tasks(id),
  goal_id        UUID REFERENCES public.goals(id),
  action         TEXT NOT NULL,   -- decompose|assign|execute|synthesize|escalate
  model          TEXT NOT NULL,   -- groq/llama3-70b | google/gemini-flash
  model_version  TEXT,
  prompt_tokens  INT,
  comp_tokens    INT,
  latency_ms     INT,
  input          JSONB,           -- sanitised (no PII)
  output         JSONB,
  error          TEXT,            -- null on success
  created_at     TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.agent_logs ENABLE ROW LEVEL SECURITY;

-- Only admins/execs can read agent logs
CREATE POLICY agent_logs_admin ON public.agent_logs
  FOR SELECT USING (
    (SELECT role FROM public.users WHERE id = auth.uid()) IN ('ceo','cfo')
  );
```

### 4.6 DB Trigger — Maintain `open_task_count`

```sql
CREATE OR REPLACE FUNCTION update_open_task_count()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' OR NEW.status = 'cancelled' THEN
    UPDATE public.users
    SET open_task_count = open_task_count - 1
    WHERE id = NEW.assigned_to AND open_task_count > 0;
  END IF;
  IF OLD.status IN ('completed','cancelled') AND NEW.status = 'in_progress' THEN
    UPDATE public.users
    SET open_task_count = open_task_count + 1
    WHERE id = NEW.assigned_to;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER task_status_change
  AFTER UPDATE OF status ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION update_open_task_count();
```

---

## 5. API Reference

Every protected endpoint requires `Authorization: Bearer <jwt>`. The JWT is issued by Supabase Auth and contains: `sub` (user ID), `role` (custom claim), `email`, `exp`.

### 5.1 Authentication

| Method | Endpoint | Auth Required | Role | Description |
|---|---|---|---|---|
| POST | `/api/auth/login` | No | — | Email/password login → returns JWT + refresh token |
| POST | `/api/auth/refresh` | Refresh token | — | Exchange refresh token for new JWT |
| POST | `/api/auth/logout` | JWT | Any | Invalidate refresh token |
| GET | `/api/me` | JWT | Any | Current user profile + role + open task count |

### 5.2 Goals

| Method | Endpoint | Role | Body / Params | Response |
|---|---|---|---|---|
| POST | `/api/goals` | ceo, cfo | `{ title, description, deadline, priority, simulation? }` | `201: { goalId, taskTree? }` |
| GET | `/api/goals` | ceo, cfo | `?status=active&priority=high` | `200: Goal[]` |
| GET | `/api/goals/:id` | Any | — | `200: Goal + nested task tree` |
| PATCH | `/api/goals/:id` | ceo, cfo | `{ status?, priority?, deadline? }` | `200: Updated Goal` |
| DELETE | `/api/goals/:id` | ceo, cfo | — | `204: Cascades to all tasks` |
| POST | `/api/simulate` | ceo, cfo | Same as POST /goals | `200: { preview: TaskTree }` |

### 5.3 Tasks

| Method | Endpoint | Role | Description |
|---|---|---|---|
| GET | `/api/tasks` | Any | My tasks, filtered by role. Query: `?status=pending&goalId=xxx` |
| GET | `/api/tasks/:id` | Any | Task detail + full lineage (goal → parent → this task) |
| PATCH | `/api/tasks/:id` | Assignee | Update status (`in_progress`, `blocked`, `completed`) |
| POST | `/api/tasks/:id/delegate` | Manager | Re-assign task to another user or role |
| POST | `/api/tasks/:id/override` | Manager+ | Edit task title/description/deadline |

### 5.4 Reports

| Method | Endpoint | Role | Description |
|---|---|---|---|
| POST | `/api/reports` | Any | Submit structured report for a task. Triggers synthesis if all siblings done. |
| GET | `/api/reports/:taskId` | Any (scoped) | All reports in the task's sub-tree |
| GET | `/api/reports/:taskId/summary` | Manager+ | Synthesised summary (triggers on demand if not cached) |

### 5.5 WebSocket Events

Connect to: `ws://api-host/ws/tasks` — Authenticated via JWT in connection query param.

| Event (Server → Client) | Payload | Who Receives |
|---|---|---|
| `task:assigned` | `{ taskId, title, deadline, goalTitle }` | Task assignee |
| `task:status_changed` | `{ taskId, oldStatus, newStatus, updatedBy }` | Assignee + parent manager |
| `task:report_submitted` | `{ taskId, reportId, isAgent }` | Manager up the chain |
| `goal:decomposed` | `{ goalId, taskCount }` | All org members |
| `agent:executing` | `{ taskId, agentType, progress }` | Exec + task manager |
| `agent:escalated` | `{ taskId, reason, confidence }` | Exec + task manager |

### 5.6 Standard Error Response Format

All API errors return a consistent JSON envelope. Never return raw error messages.

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Goal title is required",
    "field": "title",
    "requestId": "req_abc123"
  }
}
```

| HTTP Status | Error Code | When It Occurs | Client Action |
|---|---|---|---|
| 400 | `VALIDATION_ERROR` | Zod schema rejection | Show field errors to user |
| 401 | `UNAUTHORIZED` | Missing or expired JWT | Redirect to login |
| 403 | `FORBIDDEN` | Role not permitted for route | Show permission error |
| 404 | `NOT_FOUND` | Resource doesn't exist or not in scope | Show 404 UI |
| 409 | `CONFLICT` | Duplicate goal/task creation | Inform user of existing item |
| 422 | `LLM_VALIDATION_FAIL` | LLM output failed Zod schema | Retry automatically (BullMQ) |
| 429 | `RATE_LIMITED` | User exceeded rate limit | Show retry-after header value |
| 503 | `LLM_UNAVAILABLE` | All LLM providers exhausted | Inform user; job will retry |
| 500 | `INTERNAL_ERROR` | Unhandled exception | Show generic error; log to monitoring |

---

## 6. Agent Architecture (Deep Dive)

> **Agent Communication Rule:** Agent A never calls Agent B directly. Agent A writes to DB → BullMQ picks up → Agent B is invoked. No direct agent-to-agent calls, ever. This makes every action independently auditable and restartable.

### 6.1 Agent Hierarchy

| Tier | Agent | Triggered By | Output |
|---|---|---|---|
| Exec | CEO / CFO Agent | Executive goal entry | Structured goal + decomposition directive |
| Mid | Manager Agent | Decomposed sub-directive | Further task breakdown + assignments |
| Ops | Worker Agent | Leaf task + no user assigned | Task execution report |
| Cross | Synthesis Agent | Manager requests rollup | Aggregated summary from sub-reports |

### 6.2 CEO / CFO Agent

**Trigger:** Fires when a new goal is created via `POST /api/goals`.

**Responsibility:** Translate vague executive intent into a validated goal object with KPIs, priority, decomposition hints, and role assignments.

**System Prompt Structure:**
```json
{
  "role": "system",
  "content": "You are an organizational strategy AI. Your job is to: 1. Extract a clear, measurable KPI from the raw goal. 2. Identify which manager roles should receive sub-directives. 3. Estimate feasibility given org size and deadline. Output ONLY valid JSON matching the GoalSchema. No preamble."
}
```

**Hard Constraints:**
- NEVER assigns tasks directly — only creates the goal object
- Output MUST pass Zod `GoalSchema` validation before DB write
- Maximum 2 sub-directives per goal (prevents cascade explosion)
- Sets `escalate=true` if confidence < 0.6 → routes to human exec for review
- Never includes PII in `agent_logs` input/output fields

**Sample I/O:**
```json
// Input
{ "raw_goal": "Reduce operational costs by 15%", "deadline": "2025-06-01" }

// Output
{
  "goal_title": "15% Operational Cost Reduction by Q2",
  "kpi": "15% reduction in total operational spend vs Q4 baseline",
  "priority": "high",
  "decomposition_hint": "Focus on logistics and procurement",
  "sub_directive_roles": ["operations_manager", "procurement_manager"],
  "confidence": 0.82
}
```

### 6.3 Manager Agent

**Trigger:** Fires for each sub-directive role identified by the CEO Agent, when no human manager handles decomposition within 5 minutes.

**System Prompt Key Instructions:**
```
You are a department manager AI. Given a directive:
- Create between 2 and 6 concrete, specific tasks
- Each task must have: title, role, deadline_days, success_criteria
- Do NOT create tasks that already exist (check provided existing_tasks list)
- Do NOT exceed depth=2 from the goal
- Output ONLY JSON array matching TaskSchema[]
```

**Available Tools:**

| Tool | Input | Output | Purpose |
|---|---|---|---|
| `read_org_chart()` | — | `{ roles: RoleInfo[] }` | Know which roles exist in the org |
| `read_open_task_count(userId)` | `userId: string` | `{ count: number }` | Load-balance assignments |
| `read_dept_skills(dept)` | `department: string` | `{ skills: string[] }` | Match task to skill set |
| `read_existing_tasks(goalId)` | `goalId: string` | `Task[]` | Dedup against existing tasks |

**Hard Constraints:**
- Max depth = 2 (directive → task → subtask only)
- Max 6 tasks per directive
- Each task must have `title`, `role`, `deadline`, `success_criteria`
- Must not create tasks that duplicate existing open tasks

### 6.4 Worker Agent

**Trigger:** Fires when a leaf-level task has `assigned_to = NULL` and `status = 'pending'`.

**Execution Flow:**
1. Receive task context: `title`, `description`, `success_criteria`, goal context
2. Plan: identify what information is needed to satisfy `success_criteria`
3. Execute up to 3 `web_search()` or `read_internal_data()` calls
4. Synthesize findings into structured report matching `ReportSchema`
5. Set confidence score (0.0–1.0). If < 0.65 → set `escalate=true`
6. Call `write_report(taskId, payload)` → triggers synthesis check

> ❌ **Worker Agent never modifies tasks.** It only reads task data and writes reports. Any attempt to mutate task status must be rejected at the API layer.

### 6.5 Synthesis Agent

**Trigger:** Fires when ALL child tasks of a parent task have `status=completed` and all have associated reports.

**Hard Constraints:**
- Never invents data not present in child reports
- Explicitly flags contradictions between child reports
- Output capped at 500 tokens (exec-readable)
- Overall confidence = weighted average of child report confidences

### 6.6 LLM Provider & Failover

```typescript
// packages/agent-core/llm/router.ts

async function callLLM(prompt: LLMPrompt): Promise<LLMResponse> {
  const providers = [groqProvider, geminiProvider];

  for (const provider of providers) {
    try {
      const result = await provider.complete(prompt);
      await logLLMCall(provider.name, prompt, result);
      return result;
    } catch (err) {
      if (isRateLimitError(err) || isTimeoutError(err)) {
        console.warn(`[LLM] ${provider.name} failed, trying next...`);
        continue;
      }
      throw err; // non-retryable error
    }
  }

  throw new Error('All LLM providers exhausted');
}
```

---

## 7. Goal Decomposition Flow (Step-by-Step)

### 7.1 Full Request Lifecycle

| Step | Where | What Happens |
|---|---|---|
| 1 | Client (Next.js) | Executive fills GoalCreator form → `POST /api/goals` |
| 2 | Fastify Route | JWT verified → role checked → Zod validation → goal row inserted → `202 Accepted` returned immediately |
| 3 | BullMQ | `decompose` job enqueued with `{ goalId }` |
| 4 | Decompose Worker | CEO Agent called → validates goal → proceeds |
| 5 | CEO Agent | Calls Groq LLaMA 3.1 70B → receives structured goal JSON → Zod validates → writes updated goal row |
| 6 | Manager Agent(s) | One Manager Agent job per sub-directive role → calls Groq → receives task array → Zod validates |
| 7 | Assignment Engine | For each task: find users with matching role → load-balance → assign. If none → set `is_agent_task=true` |
| 8 | DB Write | All task rows written in a single transaction (rollback all on error) |
| 9 | WebSocket | `task:assigned` event emitted to each assignee; `goal:decomposed` emitted to exec |
| 10 | Agent Queue | For each `is_agent_task=true` task → `execute` job enqueued |
| 11 | Worker Agent | Executes task → writes report → triggers synthesis check |
| 12 | Synthesis Check | If all sibling tasks complete → Synthesis Agent job enqueued |
| 13 | Synthesis Agent | Aggregates child reports → writes parent report → emits `task:report_submitted` up chain |

### 7.2 Assignment Engine Logic

```typescript
// apps/api/src/services/assignmentEngine.ts

async function assignTask(task: Task): Promise<Task> {
  const { data: candidates } = await supabase
    .from('users')
    .select('id, open_task_count, skills')
    .eq('role', task.assigned_role)
    .eq('agent_enabled', true)
    .order('open_task_count', { ascending: true });  // load balance

  if (!candidates || candidates.length === 0) {
    return { ...task, assigned_to: null, is_agent_task: true };
  }

  // Prefer users whose skills match task requirements
  const skilled = candidates.filter(u =>
    task.required_skills?.every(s => u.skills?.includes(s))
  );

  const selected = skilled.length > 0 ? skilled[0] : candidates[0];
  return { ...task, assigned_to: selected.id, is_agent_task: false };
}
```

### 7.3 BullMQ Retry Strategy

```typescript
// apps/api/src/queue/index.ts

const decomposeQueue = new Queue('decompose', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,  // 2s → 4s → 8s
    },
    removeOnComplete: 100,
    removeOnFail: 500,
  }
});

// Dead letter queue handler
decomposeQueue.on('failed', async (job, err) => {
  if (job.attemptsMade >= job.opts.attempts) {
    await deadLetterQueue.add('failed_decompose', {
      originalJob: job.data,
      error: err.message,
      failedAt: new Date().toISOString()
    });
    await notifyExec(job.data.goalId, 'decomposition_failed', err.message);
  }
});
```

---

## 8. Security Implementation Guide

### 8.1 Authentication Flow

```typescript
// apps/api/src/plugins/auth.ts

import fp from 'fastify-plugin';

export default fp(async (fastify) => {
  fastify.addHook('onRequest', async (request, reply) => {
    const PUBLIC_ROUTES = ['/api/auth/login', '/api/auth/refresh', '/healthz'];
    if (PUBLIC_ROUTES.includes(request.url)) return;

    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Missing Authorization header' } });
    }

    const token = authHeader.slice(7);
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' } });
    }

    request.user = user;
    request.userRole = user.user_metadata.role;
  });
});
```

### 8.2 RBAC Middleware

```typescript
// apps/api/src/plugins/rbac.ts

export function requireRole(...roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!roles.includes(request.userRole)) {
      return reply.status(403).send({
        error: {
          code: 'FORBIDDEN',
          message: 'Insufficient permissions',
          required: roles,
          actual: request.userRole
        }
      });
    }
  };
}

// Usage in routes:
fastify.post('/api/goals',
  { preHandler: requireRole('ceo', 'cfo') },
  goalController.create
);
```

### 8.3 Prompt Injection Prevention

```typescript
// packages/agent-core/llm/sanitize.ts

const INJECTION_PATTERNS = [
  /ignore (previous|all) instructions/i,
  /you are now/i,
  /system prompt/i,
  /\[INST\]/i,
  /<\|im_start\|>/i,
];

export function sanitizeGoalInput(raw: string): string {
  const stripped = raw.replace(/<[^>]*>/g, '');

  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(stripped)) {
      throw new Error('Goal input contains disallowed content');
    }
  }

  return stripped.slice(0, 2000);
}

// User input is ALWAYS passed as data, never concatenated into system prompt
// ❌ WRONG:  systemPrompt + userInput
// ✅ CORRECT:
const messages = [
  { role: 'system', content: systemPrompt },
  { role: 'user', content: JSON.stringify({ goal: sanitizedInput }) }
];
```

### 8.4 Security Checklist

- [ ] `service_role` key **never** appears in frontend bundle or client-side code
- [ ] All cookies set with `Secure` + `SameSite=Strict`
- [ ] Fastify helmet headers enabled: CSP, HSTS, X-Frame-Options
- [ ] Rate limiting: 100 req/min per user; 10 goals/hour per exec
- [ ] `npm audit` runs in CI — fails build on critical CVEs
- [ ] PII stripped from all `agent_logs` input/output fields
- [ ] Groq/Gemini called with `do-not-train` headers where available
- [ ] All API keys in environment variables — never in source code or logs
- [ ] Secrets rotated quarterly; stored in Render/Vercel encrypted secret storage

---

## 9. Error Handling Reference

### 9.1 LLM Output Validation

```typescript
// Always validate LLM output with Zod before any DB write
async function decompose(goal: Goal): Promise<Task[]> {
  const rawResponse = await callLLM(buildPrompt(goal));

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawResponse.content);
  } catch {
    throw new Error(`LLM returned non-JSON: ${rawResponse.content.slice(0, 200)}`);
  }

  const result = TaskTreeSchema.safeParse(parsed);
  if (!result.success) {
    // Log the Zod issues for prompt debugging
    await logAgentError('manager_agent', goal.id, {
      zodIssues: result.error.issues,
      rawOutput: rawResponse.content
    });
    throw new LLMValidationError(result.error.issues);
  }

  return result.data;
}
```

### 9.2 Health Check Endpoint

```typescript
// apps/api/src/routes/health.ts

fastify.get('/healthz', async () => {
  const checks = await Promise.allSettled([
    supabase.from('users').select('count').limit(1),
    redis.ping(),
  ]);

  return {
    status: checks.every(c => c.status === 'fulfilled') ? 'ok' : 'degraded',
    db: checks[0].status,
    redis: checks[1].status,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  };
});
```

---

## 10. Environment Variables

Copy `.env.example` to `.env.local` for development. **All secrets must be in environment variables — never in source code or logs.**

| Variable | App | Required | Description |
|---|---|---|---|
| `SUPABASE_URL` | API + Web | ✅ Yes | Supabase project URL (e.g. `https://xxx.supabase.co`) |
| `SUPABASE_ANON_KEY` | API + Web | ✅ Yes | Public anon key — safe for browser, but RLS must be correct |
| `SUPABASE_SERVICE_ROLE_KEY` | API only | ✅ Yes | Bypasses RLS — **NEVER expose to browser** |
| `GROQ_API_KEY` | API only | ✅ Yes | Groq API key — get from console.groq.com |
| `GEMINI_API_KEY` | API only | ✅ Yes | Google AI Studio key — Gemini fallback |
| `UPSTASH_REDIS_URL` | API only | ✅ Yes | BullMQ Redis connection URL |
| `UPSTASH_REDIS_TOKEN` | API only | ✅ Yes | Upstash auth token |
| `JWT_SECRET` | API only | ✅ Yes | 32+ char random string for JWT signing |
| `NEXT_PUBLIC_API_URL` | Web only | ✅ Yes | Backend URL visible to browser |
| `NEXT_PUBLIC_SUPABASE_URL` | Web only | ✅ Yes | Same as `SUPABASE_URL` |
| `NEXT_PUBLIC_SUPABASE_ANON` | Web only | ✅ Yes | Same as `SUPABASE_ANON_KEY` |
| `RENDER_DEPLOY_HOOK` | CI/CD | Optional | Webhook URL to trigger Render deploy |
| `VERCEL_TOKEN` | CI/CD | Optional | Vercel CLI token for GitHub Actions deploy |

---

## 11. Non-Functional Requirements & Targets

| Requirement | MVP Target | v1 Target | How to Achieve |
|---|---|---|---|
| Task decomposition latency | < 10 seconds | < 4 seconds | Groq is fast; BullMQ async so 202 returned instantly; WS push on complete |
| Concurrent users | 100 | 500 | Stateless Fastify; horizontal scale on Render; Redis shared state |
| API availability | 99% | 99.5% | UptimeRobot ping keeps Render awake; Supabase SLA 99.9% |
| Decomposition accuracy | ≥ 70% useful tasks | ≥ 90% | Iterative prompt improvement; clarification step; exec override |
| Agent fallback rate | < 40% | < 20% | Onboard workers early; improve assignment engine |
| Task completion rate | ≥ 60% | ≥ 85% | Clear `success_criteria`; deadline reminders; escalation |
| P99 API response time | < 500ms | < 200ms | Fastify; DB indexes on `task.assigned_to`, `goal_id`, `status` |
| Security: no cross-role leak | 0 incidents | 0 incidents | RLS on every table + RBAC in every route handler (defence in depth) |

---

*ORGOS connects intent to execution. Not a task manager. Not an AI assistant. An AI Organizational Operating System.*