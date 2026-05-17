# ORGOS Local Development Setup Guide

**Status**: ✅ All code compiled and ready for local testing

## Prerequisites

- Node.js 18+ (npm 9+)
- Docker (for PostgreSQL + Redis) OR local Postgres + Redis installations

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Configure Environment Variables

Create `.env.local` in the project root:

```bash
cp .env.example .env.local
```

Then fill in the following required credentials:

### Database & Authentication (Supabase)

| Variable | Source | Required |
|----------|--------|----------|
| `SUPABASE_URL` | Supabase project settings → API section | ✅ YES |
| `SUPABASE_ANON_KEY` | Supabase project settings → API section (public key) | ✅ YES |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase project settings → API section (secret key) | ✅ YES |
| `NEXT_PUBLIC_SUPABASE_URL` | Same as `SUPABASE_URL` (web reads root `.env.local` via `next.config.js`) | ✅ YES |
| `NEXT_PUBLIC_SUPABASE_ANON` | Same as `SUPABASE_ANON_KEY` (alias OK — only anon key, never service role) | ✅ YES |

**Note:** Keep these in **repo root** `.env.local`, not only `apps/web/`. If you only set `SUPABASE_URL` + `SUPABASE_ANON_KEY`, the web app maps them automatically. Restart `npm run dev` after env changes.

**Get these from**: https://app.supabase.com → Select project → Settings → API

### Google OAuth (Supabase Auth)

Enable **Google** under Authentication → Providers, then set URL configuration:

| Setting | Local | Production |
|---------|-------|------------|
| Site URL | `http://localhost:3000` | your deployed web origin (`WEB_ORIGIN`) |
| Redirect URLs | `http://localhost:3000/auth/callback` | `https://<your-domain>/auth/callback` |

Login uses **Continue with Google** on `/login`; the callback page exchanges the OAuth code and calls `POST /api/auth/oauth/callback` to set the `orgos_access_token` cookie (same as email/password login).

### Caching & Job Queue (Upstash Redis)

| Variable | Source | Required |
|----------|--------|----------|
| `UPSTASH_REDIS_REST_URL` | Upstash console → Database → REST API section | ✅ YES |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash console → Database → REST API section | ✅ YES |

**Get these from**: https://console.upstash.com → Select database → REST API

**Alternative (local Redis)**:
```bash
docker run -d -p 6379:6379 redis:latest
```

### LLM / AI Providers

| Variable | Source | Required | Fallback |
|----------|--------|----------|----------|
| `GROQ_API_KEY` | https://console.groq.com/keys | ✅ YES | Gemini if unavailable |
| `GEMINI_API_KEY` | Google Cloud → API Keys | ⚠️ OPTIONAL | Used as fallback |

### Observability (Optional)

| Variable | Source | Required |
|----------|--------|----------|
| `SENTRY_DSN` | Sentry project settings | ❌ NO |
| `DATADOG_API_KEY` | Datadog org settings | ❌ NO |
| `DATADOG_ENABLED` | Set to `false` for local | ❌ NO |

### JWT & API Configuration

| Variable | Value | Required |
|----------|-------|----------|
| `JWT_SECRET` | Generate: `openssl rand -hex 32` | ✅ YES |
| `NODE_ENV` | `development` | ✅ YES |
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000` | ✅ YES |

## Step 3: Set Up Database & Migrations

### Option A: Using Supabase Cloud (Recommended)

1. Create Supabase project at https://app.supabase.com
2. Supabase automatically provides PostgreSQL database
3. Run migrations via Supabase dashboard or CLI:
   ```bash
   supabase start
   supabase db push
   ```

### Option B: Local PostgreSQL + Docker

```bash
docker run -d \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=orgos_dev \
  -p 5432:5432 \
  postgres:15-alpine

# Update .env.local
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/orgos_dev
```

Then run migrations:
```bash
npx prisma migrate dev
```

## Step 4: Start Development Servers

### Terminal 1: API Server (Fastify on port 4000)
```bash
cd apps/api
npm run dev
```

### Terminal 2: Web App (Next.js on port 3000)
```bash
cd apps/web
npm run dev
```

### Terminal 3: Background Job Processor (Optional)
```bash
cd apps/api
npm run queue:worker
```

## Step 5: Verify Setup

### API Health Check
```bash
curl http://localhost:4000/health
# Should return 200 OK
```

### Frontend Access
```
Open http://localhost:3000 in browser
```

### Login
- **Email**: (register via UI)
- **Password**: (set during registration)
- **Role**: CEO, CFO, Manager, or Worker (set during profile setup)

## Credential Setup Checklist

- [ ] Supabase account created
- [ ] Supabase URL and keys copied to `.env.local`
- [ ] Upstash Redis created (or local Redis running)
- [ ] Upstash Redis URL and token copied to `.env.local`
- [ ] Groq API key obtained and set
- [ ] JWT_SECRET generated and set
- [ ] DATABASE_URL configured (Supabase or local)
- [ ] `npm install` completed
- [ ] Migrations applied (Supabase or `npx prisma migrate dev`)

## Quick Start Summary

```bash
# 1. Install
npm install

# 2. Create .env.local (fill in credentials from services above)
cp .env.example .env.local

# 3. Start API (Terminal 1)
cd apps/api && npm run dev

# 4. Start Web (Terminal 2)
cd apps/web && npm run dev

# 5. Open http://localhost:3000
```

## Architecture & How It Works

### Authentication Flow
1. **User registers** via web UI
2. **Supabase Auth** handles email verification & session management
3. **MFA optional** - TOTP setup for CEO/CFO roles
4. **JWT tokens** stored in secure session cookies

### Goal → Task Decomposition Pipeline
1. **CEO inputs strategic goal** (raw text with priority, deadline)
2. **Goal decomposed by AI agent** → sub-directives + KPI
3. **Directives → Manager creates tasks** (2-6 per directive)
4. **Tasks assigned to workers** based on role/capacity
5. **Workers execute** and provide evidence/reports
6. **Synthesized report** generated on completion

### Real-time Updates
- **Socket.io** connections per user, org, and role
- **BullMQ queues** process long-running decomposition jobs
- **Redis** caches session data and queue state

### Database Schema
- **goals** - Strategic objectives (status: active/paused/completed/cancelled)
- **tasks** - Individual work items (depth: 0=goal-level, 1=directive, 2=subtask)
- **users** - Org members with roles (ceo, cfo, manager, worker)
- **comments** - Task discussion threads
- **attachments** - Evidence files
- **embeddings** - RAG context vectors (pgvector)

## Troubleshooting

### "Connection refused" on port 4000/3000
→ Check if servers are running in correct terminals

### "Invalid Supabase credentials"
→ Verify URL and keys match your Supabase project settings
→ Check `NEXT_PUBLIC_SUPABASE_URL` is set correctly

### "Redis connection failed"
→ Verify Upstash credentials OR local Redis is running
→ Test: `redis-cli ping` (if using local)

### "LLM API error"
→ Verify Groq API key is valid and has remaining quota
→ Check if Gemini fallback is available

### Build fails with "Cannot find module"
→ Run `npm run build` in agent-core first
→ Then `npm run build` in API (depends on agent-core dist)

## Production Deployment

See `docker-compose.local.yml` for local Docker setup.

For production:
- Use managed Supabase (automatic backups, replication)
- Use Upstash Redis (automatic failover)
- Deploy API to Railway or Vercel
- Deploy Web to Vercel (Next.js optimal)
- Configure SENTRY_DSN for error tracking
- Set DATADOG_ENABLED=true for observability

## Security Notes

- 🚫 Never commit `.env.local` to git
- 🚫 Never expose `SUPABASE_SERVICE_ROLE_KEY` to client
- 🚫 Never hardcode API keys in code
- ✅ Rotate credentials immediately if exposed
- ✅ Use environment variable placeholders in `.env.example`
- ✅ Store production secrets in cloud provider vault

## Run & Verify: E2E, Observability, CI

These steps cover the remaining local-first items: opt-in smoke E2E, Sentry verification, Prometheus scraping (or Datadog), and CI OIDC deploy wiring.

### 1) Opt-in smoke E2E (local-first, no Docker required)

The repository includes an opt-in smoke E2E test that runs basic end-to-end checks against a running API. By default the smoke tests are skipped to avoid failures when you don't have ephemeral cloud creds.

Prereqs: API running (port 4000) and either Supabase + Upstash ephemeral creds or local Postgres + Redis configured in `.env.local`.

Run locally:
```bash
# enable the opt-in smoke suite and point to local API (defaults to http://localhost:4000)
cd apps/api
RUN_E2E=true API_URL=http://localhost:4000 npm run test -- --testNamePattern="smoke" 
```

Alternative target (full smoke integration runner):
```bash
# executes the dedicated smoke integration script (uses RUN_E2E guard)
cd apps/api
RUN_E2E=true npm run smoke:integration
```

Notes:
- If you rely on cloud Supabase/Upstash, set `SUPABASE_*` and `UPSTASH_*` in `.env.local` with ephemeral credentials before running.
- The smoke tests are intentionally minimal (create account, healthcheck, simple RAG query) — they are not a full load test.

### 2) Verify Sentry ingestion (quick local verification)

1. Create a Sentry project and copy the `SENTRY_DSN`.
2. Add `SENTRY_DSN` to `.env.local` (or set in your shell), then restart the API.

Example:
```bash
cd /path/to/repo
export SENTRY_DSN="https://<public>@o<org>.ingest.sentry.io/<proj>"
cd apps/api && npm run dev
# Trigger an error or visit an endpoint that throws; Sentry captures on unhandled exceptions
curl http://localhost:4000/health
```

3. In Sentry UI, search for events from the last 10 minutes to confirm ingestion.

### 3) Prometheus /metrics or Datadog (local verification)

The API exposes `/metrics` (Prometheus format) when `prom-client` is available. For local verification:

```bash
# Start API
cd apps/api && npm run dev

# Fetch metrics text
curl http://localhost:4000/metrics | head -n 40
```

To scrape with Prometheus (example `prometheus.yml`):

```yaml
scrape_configs:
  - job_name: 'orgos-api'
    static_configs:
      - targets: ['host.docker.internal:4000'] # adapt for your environment
    metrics_path: /metrics
```

Datadog: enable `DATADOG_ENABLED=true` and set `DATADOG_API_KEY` in your environment; the repo includes notes in `ci/OBSERVABILITY_SETUP.md`.

### 4) CI: OIDC deploy wiring (what's required)

We pinned actions and added an OIDC-enabled deploy job stub in `.github/workflows/ci.yml`. To make it functional you must:

- Choose provider: AWS / GCP / Azure.
- Configure the provider trust (workload identity / OIDC) for GitHub Actions and grant a short-lived role to the action OIDC subject.
- Add any provider-specific secrets or set the OIDC role mapping in your cloud console — the workflow uses `id-token: write` and expects env variables like `AWS_ROLE_ARN` or `GCP_WORKLOAD_IDENTITY_PROVIDER`.

Quick checklist (provider-agnostic):

1. Create workload identity / OIDC trust from GitHub Actions in cloud provider.
2. Create a minimal service account / role with least privilege for deploys.
3. Update repository Secrets or environment with any small required values (the workflow is designed to prefer id-token/OIDC and avoid long-lived secrets).
4. Run a test deployment in a non-prod environment.

See `ci/GITHUB_ACTIONS_HARDENING.md` for provider-specific steps and example snippets.

### 5) Next steps & recommended order

1. Run opt-in smoke E2E locally (`RUN_E2E=true`) to validate runtime behavior.
2. Wire Sentry (`SENTRY_DSN`) and confirm events arrive.
3. Enable Prometheus scraping locally or toggle Datadog flags and confirm metrics.
4. Configure cloud OIDC for CI deploys and run a dry-run deploy to staging.

If you'd like, I can try to run the opt-in smoke E2E now — but I need ephemeral Supabase/Upstash credentials or confirmation to use local Postgres+Redis. Tell me which you prefer and I'll proceed.
