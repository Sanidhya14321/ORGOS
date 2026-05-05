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
| `NEXT_PUBLIC_SUPABASE_URL` | Same as `SUPABASE_URL` | ✅ YES |
| `NEXT_PUBLIC_SUPABASE_ANON` | Same as `SUPABASE_ANON_KEY` | ✅ YES |

**Get these from**: https://app.supabase.com → Select project → Settings → API

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
