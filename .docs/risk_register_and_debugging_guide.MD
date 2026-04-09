# ORGOS — Risk Register & Debugging Guide
### Complete reference for everything that can go wrong and how to fix it
> Version 1.0 · April 2025 · Internal

---

## Table of Contents

1. [Technical Risk Register](#1-technical-risk-register)
2. [Security Risk Register](#2-security-risk-register)
3. [Product Risk Register](#3-product-risk-register)
4. [Debugging Runbook](#4-debugging-runbook)
5. [CI/CD & Deployment Guide](#5-cicd--deployment-guide)
6. [Known Limitations (MVP)](#6-known-limitations-mvp)

---

## 1. Technical Risk Register

### 1.1 LLM Risks

| Risk | Severity | Probability | Root Cause | Mitigation | Detection |
|---|---|---|---|---|---|
| Over-decomposition | High | Medium | LLM creates 20+ trivial tasks overwhelming users | Enforce `max depth=2`, `max tasks=6` in prompt + Zod schema. Reject if exceeded. | Monitor avg tasks per goal; alert if > 8 |
| Hallucinated role assignments | High | Medium | Agent assigns task to role not in org | Post-LLM: validate all roles against roles enum table. Reject invalid, retry once. | Zod validation failure → job retry log |
| LLM timeout | Medium | High (free tier) | Groq 30 req/min limit hit during peak | BullMQ retry with exponential backoff; automatic failover to Gemini Flash | BullMQ failed job count in dashboard |
| Prompt injection | Critical | Low | User embeds jailbreak in goal text | Sanitize input; system prompt has explicit injection guards; parse output as JSON only | Pattern match in `sanitizeGoalInput()` |
| Schema drift | High | Low | LLM output structure changes after model update | Pin model version in API call; Zod strict mode; integration test suite asserts schema | CI integration tests fail on model change |
| Infinite agent loop | High | Low | Synthesis re-triggers decomposition on error | Max iteration counter per job (3). Dead-letter queue after 3 retries. Alert sent. | Job attempt count in BullMQ dashboard |

### 1.2 Database Risks

| Risk | Severity | Mitigation | How to Test |
|---|---|---|---|
| RLS misconfiguration — worker sees other dept tasks | Critical | Automated RLS policy tests in CI using `supabase/gotrue`. Test every role × every table. | Test: worker user queries `/tasks` → assert only own tasks returned |
| Supabase 500 MB free tier exceeded | High | `agent_logs` retention policy: delete rows > 90 days via cron. Move old logs to S3 JSON. | Monitor DB size in Supabase dashboard weekly |
| Task count denormalization drift | Medium | Update `open_task_count` via DB trigger on task status change, not application code. | Test: complete task → verify `user.open_task_count` decrements |
| Cascade delete wipes tasks on goal delete | Medium | Soft-delete goals (`status=cancelled`) rather than hard delete. Add confirm modal in UI. | Test: delete goal → verify tasks still readable with `status=cancelled` |

### 1.3 Infrastructure Risks

| Risk | Mitigation | Recovery Procedure |
|---|---|---|
| Render free tier auto-sleep (15 min inactivity, 30s cold start) | UptimeRobot free plan: ping `/healthz` every 10 minutes. Or upgrade to $7/mo Starter. | No recovery needed if ping is active. Client shows "Connecting..." and retries on cold start. |
| WebSocket memory leak (stale connections) | Heartbeat ping every 30s. Disconnect cleanup on 60s timeout. Track active connections in Redis. | Restart API server (Render redeploy). BullMQ jobs survive restart — Redis persists them. |
| Groq model deprecation | Abstract all LLM calls behind `LLMProvider` interface. Provider swap takes < 30 min. | Update `groq.ts` model string. Run integration tests. Deploy. |
| Upstash Redis 10K cmd/day exceeded | Efficient BullMQ job design. Cache invalidation strategy. Monitor cmd count. | Upgrade to Upstash Pay-as-you-go ($0.20/100K cmds) — instant, no migration needed. |

---

## 2. Security Risk Register

| Risk | Impact | Mitigation Stack |
|---|---|---|
| Broken JWT verification | Complete auth bypass | 1. Supabase Auth verifies on every request. 2. Token rotation on sensitive actions. 3. 15-min access token expiry. |
| Privilege escalation (worker POSTs to exec route) | Data breach | 1. RBAC middleware in Fastify route. 2. RLS policy at DB layer (defence in depth). 3. Role embedded in JWT — not user-controlled. |
| Agent log data exfiltration | Org structure + strategy leak | 1. `agent_logs` endpoint is admin-only. 2. PII scrubbed from logs before write. 3. `user_id` stored as hash in logs. |
| Third-party LLM data privacy | Sensitive org data trained on by provider | 1. Anonymise PII in prompts (no names/emails). 2. Groq/Gemini zero-data-retention headers. 3. Review data processing agreements. |
| Supply-chain attack via npm | Malicious code execution | 1. `npm audit` in CI (fails build on critical). 2. Dependabot alerts enabled. 3. `package-lock.json` committed and reviewed. |
| SSRF via worker `webSearch` tool | Internal network access | 1. `webSearch` only calls approved external API. 2. URL allowlist: no private IP ranges. 3. Timeout: 5s max per search call. |

---

## 3. Product Risk Register

### 3.1 User Adoption Risks

| Risk | Mitigation |
|---|---|
| Workers distrust AI-generated tasks they didn't create | Show full lineage on every task card: Goal title → Directive → This Task. Allow workers to annotate and request clarification. |
| Feels like surveillance / micro-management | Override controls prominent in UI. Optional free-form notes on tasks. Task editing allowed by assignee. |
| Goal ambiguity causes meaningless decomposition | Clarification step: system asks 2–3 clarifying questions before decomposing. Exec must confirm before commit. |
| Executive doesn't review rollup reports | Automated daily digest email. Dashboard badge for unread exec-level reports. Slack integration (v2). |
| Skill mismatch: wrong task to wrong worker | Role + skill tagging on `users` table. Assignment engine checks skill overlap. Manager override always available. |

### 3.2 Operational Risks

| Risk | Mitigation |
|---|---|
| Team onboarding friction — users don't understand task context | Onboarding flow: interactive tour; contextual tooltips on first 5 tasks; sample goal walkthrough. |
| Managers manually re-doing all AI decompositions | Prompt quality investment upfront. Exec override rate tracked as KPI — target < 15%. |
| No backup when both Groq and Gemini are down | Dead-letter queue preserves all jobs. Automatic retry when providers recover. User notified via WS/email. |

---

## 4. Debugging Runbook

### 4.1 Goal Decomposition Not Starting

**Symptom:** `POST /api/goals` returns `202` but no tasks appear after 30 seconds.

| Check | Where | Command / Action |
|---|---|---|
| Is BullMQ worker running? | Render logs | Look for: `[Worker] decompose worker started` |
| Is Redis connected? | API startup logs | Look for: `Redis connected` or Upstash connection error |
| Did the job enqueue? | BullMQ dashboard or logs | Log: `queue.add()` return value — should have `.id` |
| Did Groq return error? | `agent_logs` table | `SELECT * FROM agent_logs WHERE action='decompose' ORDER BY created_at DESC LIMIT 5` |
| Is Groq rate limit hit? | `agent_logs.error` field | Check for `429` or `rate_limit_exceeded` in error column |
| Did Zod validation fail? | Worker process logs | Look for: `ZodError` in decompose worker logs |

### 4.2 RLS / Authorization Errors

**Symptom:** User gets empty array from `/api/tasks` even though tasks exist.

| Check | Action |
|---|---|
| Is JWT role claim correct? | Decode JWT at jwt.io → check `user_metadata.role` matches expected value |
| Is RLS policy correct? | Run policy test in Supabase SQL editor as the user's role |
| Is `service_role` being used where `anon` should be? | Verify API uses `service_role` only in server workers, not in route handlers |
| Is the user in the `users` table? | `SELECT * FROM users WHERE id = '<uid>'` — may be missing if onboarding incomplete |

### 4.3 WebSocket Events Not Received

| Check | Action |
|---|---|
| Is WS connected? | Browser DevTools → Network → WS tab → verify handshake `101` response |
| Is JWT in connection query? | Check `socket.ts`: `io(url, { auth: { token: jwt } })` |
| Is user in correct room? | Server should join room named by user ID on connect. Check server join logs. |
| Is notifier called after DB write? | Add log in `notifier.ts` — verify `emit()` is called with correct event name and room |

### 4.4 LLM Output Schema Validation Failures

**Symptom:** Tasks never created; `agent_logs` shows `LLM_VALIDATION_FAIL`.

```typescript
// Debugging strategy: log the raw LLM response before Zod parse

const rawResponse = await callLLM(prompt);
console.log('[DEBUG] Raw LLM output:', rawResponse.content);

try {
  const parsed = TaskTreeSchema.parse(JSON.parse(rawResponse.content));
} catch (err) {
  if (err instanceof ZodError) {
    console.error('[DEBUG] Zod issues:', JSON.stringify(err.issues, null, 2));
    // Common issues:
    // - 'role' value not in enum → prompt needs to list valid roles explicitly
    // - 'deadline' not ISO string → prompt must specify: 'deadline as ISO-8601 string'
    // - tasks.length > 6 → add to system prompt: 'MAXIMUM 6 tasks per directive'
  }
}
```

**Common Zod failures and fixes:**

| Zod Issue | Root Cause | Fix |
|---|---|---|
| `role` value not in enum | LLM invented a role name | Add valid roles list explicitly to prompt: `Valid roles: ceo, cfo, manager, worker` |
| `deadline` not ISO string | LLM returned "in 3 days" instead of date | Prompt: `deadline must be an ISO-8601 datetime string, e.g. 2025-06-01T00:00:00Z` |
| `tasks.length > 6` | LLM over-decomposed | Add to prompt: `STRICT MAXIMUM: 6 tasks per directive. Stop at 6.` |
| Missing `success_criteria` | LLM skipped optional-looking field | Mark as `required` in schema + prompt: `success_criteria is REQUIRED for every task` |
| Nested JSON in string field | LLM double-encoded | Parse with `JSON.parse(JSON.parse(raw))` — then fix prompt to output single-encoded JSON |

### 4.5 Performance Debugging

| Symptom | Likely Cause | Fix |
|---|---|---|
| Goal decomposition > 10s | Groq latency spike or rate limit causing retry | Check `agent_logs.latency_ms`. If consistently > 8000ms, check Groq status page. |
| API response > 500ms for `GET /tasks` | Missing DB index on `tasks.assigned_to` | `CREATE INDEX idx_tasks_assigned_to ON tasks(assigned_to, status);` |
| WebSocket disconnect on mobile | Render free tier sleeping + WS timeout | Configure Socket.io `pingTimeout: 60000`, `pingInterval: 25000` |
| Memory leak in API | Stale Socket.io rooms / event listeners | Track connection count in Redis. Cleanup on `disconnect` event. |
| BullMQ jobs piling up | Worker process not running or crashed | Check Render service logs. Ensure worker process is a separate Render service, not part of web server. |

### 4.6 Database Debugging Queries

```sql
-- Find tasks stuck in 'pending' that should have been agent-executed
SELECT t.id, t.title, t.is_agent_task, t.created_at, g.title as goal_title
FROM tasks t
JOIN goals g ON t.goal_id = g.id
WHERE t.status = 'pending'
  AND t.is_agent_task = true
  AND t.created_at < now() - interval '5 minutes';

-- Check agent log errors in last hour
SELECT agent_type, action, model, error, created_at
FROM agent_logs
WHERE error IS NOT NULL
  AND created_at > now() - interval '1 hour'
ORDER BY created_at DESC;

-- Check RLS is working: run as a specific user role
SET LOCAL role TO 'worker_role';  -- use actual Supabase RLS testing method
SELECT count(*) FROM tasks;  -- should only return that user's tasks

-- Find goals with no tasks (decomposition may have failed silently)
SELECT g.id, g.title, g.created_at, count(t.id) as task_count
FROM goals g
LEFT JOIN tasks t ON t.goal_id = g.id
GROUP BY g.id
HAVING count(t.id) = 0
  AND g.created_at < now() - interval '2 minutes';

-- Token usage by model (cost monitoring)
SELECT model, sum(prompt_tokens) as total_prompt, sum(comp_tokens) as total_comp,
       avg(latency_ms) as avg_latency_ms, count(*) as total_calls
FROM agent_logs
WHERE created_at > now() - interval '24 hours'
GROUP BY model;
```

---

## 5. CI/CD & Deployment Guide

### 5.1 GitHub Actions — CI Pipeline

```yaml
# .github/workflows/ci.yml
name: CI
on:
  pull_request:
    branches: [main]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run typecheck        # tsc --noEmit across all packages
      - run: npm run lint             # ESLint across all packages
      - run: npm run test             # Vitest unit + integration tests

  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm audit --audit-level=critical   # Fail on critical CVEs
```

### 5.2 GitHub Actions — Deploy Pipeline

```yaml
# .github/workflows/deploy.yml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  deploy-api:
    needs: [quality, security]
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Render Deploy
        run: curl -X POST ${{ secrets.RENDER_DEPLOY_HOOK }}

  deploy-web:
    needs: [quality, security]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npx vercel --prod --token ${{ secrets.VERCEL_TOKEN }}
```

### 5.3 Render Configuration (`render.yaml`)

```yaml
services:
  # API web server
  - type: web
    name: orgos-api
    env: node
    buildCommand: npm ci && npm run build --filter=api
    startCommand: node apps/api/dist/server.js
    envVars:
      - key: NODE_ENV
        value: production
      # All secrets set in Render dashboard, not here

  # BullMQ worker process (SEPARATE service — never combine with web server)
  - type: worker
    name: orgos-worker
    env: node
    buildCommand: npm ci && npm run build --filter=api
    startCommand: node apps/api/dist/queue/workers/index.js
```

> ⚠️ **Critical:** The BullMQ worker MUST be a separate Render service from the API web server. If the web server auto-sleeps, the worker can continue processing jobs. Never run both in the same process.

### 5.4 Local Development Quick Start

```bash
# 1. Clone and install
git clone https://github.com/your-org/orgos
cd orgos
npm install

# 2. Environment setup
cp .env.example .env.local
# Fill in all required variables

# 3. Database setup
npx supabase db push
npx supabase gen types typescript --local > packages/db/types/supabase.ts

# 4. Start all services
npm run dev
# Next.js: http://localhost:3000
# Fastify API: http://localhost:4000

# 5. Create first user
# Go to Supabase Auth dashboard → Add user → set role=ceo in user_metadata
```

### 5.5 UptimeRobot Setup (Required for Render Free Tier)

1. Sign up at uptimerobot.com (free plan)
2. Add new monitor: HTTP(s)
3. URL: `https://your-api.onrender.com/healthz`
4. Monitoring interval: **5 minutes** (free plan minimum)
5. Alert contacts: your email

This prevents Render's 15-minute auto-sleep which causes ~30-second cold starts.

---

## 6. Known Limitations (MVP)

These are accepted constraints for v1. Each is documented here so Copilot knows not to "fix" them unless explicitly asked.

- **Max 3 decomposition levels** — goal → directive → task → subtask. Deeper hierarchies not supported. The DB schema supports it (`depth` column) but the Manager Agent prompt enforces max depth=2.

- **No real-time collaboration on the same task** — last-write-wins on `PATCH /tasks/:id`. No conflict resolution. Acceptable for MVP where tasks have single owners.

- **Agent web_search limited to 3 calls per task** — cost control on free tier. Hardcoded in Worker Agent prompt and enforced with a call counter.

- **No native mobile app** — responsive web only. PWA is installable but no push notifications until v2.

- **Groq rate limit affects large orgs** — 30 req/min free tier. 20+ simultaneous decompositions will fall back to Gemini. Accepted; BullMQ queues jobs so none are lost.

- **No multi-tenancy** — one Supabase project = one organisation. Multi-tenant architecture is v2.

- **Simulation mode does not persist** — `POST /api/simulate` returns a preview but nothing is stored. Users cannot save or compare simulations.

- **Agent logs are append-only** — no editing or deletion from UI. Retention cron runs server-side only.

---

*When in doubt: check `agent_logs` first, then BullMQ job status, then Supabase RLS policies.*