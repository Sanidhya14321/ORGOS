# ORGOS - AI-Powered OKR/Goal Decomposition & Execution System

Full-stack AI system for decomposing organizational goals into actionable tasks, powered by multi-tier LLM agents (CEO → Manager → Worker).

## Architecture

- **Frontend**: Next.js 14 (React 18, Server Components, Zustand, Socket.io)
- **Backend**: Fastify 4 + Supabase (Auth/Postgres) + Upstash Redis + BullMQ
- **Agents**: Groq LLM (primary) + Gemini (fallback), Zod-validated outputs
- **Real-time**: Socket.io with JWT handshake and role-based room delivery
- **Workers**: Decompose → Execute → Synthesize pipeline with 3-attempt retries

## Local Development Setup

### Prerequisites

1. **Supabase Project** (already configured)
	- URL: Check `.env.local`
	- Keys: Anon + Service Role (in `.env.local`)

2. **Upstash Redis** (already configured)
	- URL: Check `.env.local`
	- Token: Check `.env.local`

3. **LLM APIs** (already configured)
	- `GROQ_API_KEY`: From https://console.groq.com
	- `GEMINI_API_KEY`: From https://aistudio.google.com/app/apikey (optional, fallback)

### Install & Run

```bash
# Install dependencies (one-time)
npm install

# Start both API (port 4000) and Frontend (port 3000) in parallel
npm run dev

# OR separately in different terminals:
cd apps/api && npm run dev        # Terminal 1: API on localhost:4000
cd apps/web && npm run dev        # Terminal 2: Frontend on localhost:3000
```

### Verify Local Setup

```bash
# Type checking (full monorepo)
npm run typecheck

# Integration tests (should show 3/3 passing)
npm run test

# Manual API test (after API starts)
curl http://localhost:4000/health

# Manual frontend test
open http://localhost:3000  # Should redirect to /dashboard
```

## Project Structure

```
ORGOS/
├── apps/
│   ├── api/                      # Fastify backend
│   │   ├── src/
│   │   │   ├── index.ts          # Entry point (loads env, starts server)
│   │   │   ├── server.ts         # Fastify config + plugins
│   │   │   ├── config/env.ts     # Environment validation (Zod)
│   │   │   ├── routes/           # API endpoints (auth, goals, tasks, reports)
│   │   │   ├── services/         # Business logic (goalEngine, assignmentEngine, notifier)
│   │   │   ├── queue/            # BullMQ workers (decompose, execute, synthesize)
│   │   │   ├── lib/              # Clients (Supabase, Groq, Redis)
│   │   │   └── plugins/          # Fastify plugins (auth, RBAC)
│   │   └── test/                 # 3/3 integration tests
│   └── web/                      # Next.js frontend
│       ├── app/
│       │   ├── page.tsx          # Home (redirects to /dashboard)
│       │   ├── login/page.tsx    # Login
│       │   ├── dashboard/        # Role dashboards ([role]/page.tsx)
│       │   └── layout.tsx        # Root + Tailwind setup
│       ├── components/           # UI (dashboard, login, shell)
│       ├── lib/                  # Utilities (api, socket, auth)
│       ├── middleware.ts         # Auth guard
│       └── store/                # Zustand state management
├── packages/
│   ├── shared-types/             # Zod schemas (Goal, Task, Report, User)
│   ├── agent-core/               # LLM agents (CEO, Manager, Worker, Synthesis)
│   └── db/                       # SQL RLS schema + migrations
├── .env.local                    # Local credentials (git-ignored)
├── .env.example                  # Template with placeholder values
├── package.json                  # Monorepo root (npm workspaces + Turborepo)
└── turbo.json                    # Build cache config
```

## API Overview

**Health Check**: `GET http://localhost:4000/health`

**Auth Routes**:
- `POST /auth/login` - Login with email/password
- `POST /auth/logout` - Clear session
- `GET /me` - Current user info

**Goal Management**:
- `POST /goals` - Create goal
- `GET /goals/:id` - Get goal with task tree
- `PATCH /goals/:id` - Update goal
- `DELETE /goals/:id` - Archive goal

**Task Management**:
- `GET /tasks/:id` - Get task details
- `PATCH /tasks/:id` - Update task status/priority

**Reports**:
- `POST /reports/:goal_id` - Generate synthesis report
- `GET /reports/:goal_id/summary` - Get report summary

**Real-Time**: `WS /ws` - Socket.io WebSocket (JWT auth required)

## Real-Time Events

Rooms: `user:{user_id}`, `org:{org_id}`, `role:{role}`

Events:
- `goal:created`, `goal:updated`, `goal:completed`
- `task:assigned`, `task:updated`, `task:completed`
- `report:ready`, `synthesis:progress`

## Development Workflow

1. **Local Setup**: `npm install`, ensure `.env.local` exists
2. **Start Dev**: `npm run dev` (watches files, live reload)
3. **Test**: `npm run typecheck && npm run test`
4. **Commit**: Push to GitHub (configured in `.git`)

## Quality Metrics

- **Type Safety**: 7/7 TypeScript checks passing (strict mode)
- **Integration Tests**: 3/3 passing (notifier, reports-route, synthesize-worker)
- **Code Style**: Prettier + ESLint configured
- **Dependencies**: 364 packages (7 vulnerabilities - non-critical)

## Key Modules

**Agents** (`packages/agent-core/src/agents/`):
- `ceo.ts` - Top-level goal context & decomposition
- `manager.ts` - Task priority & resource planning
- `worker.ts` - Execution suggestions & sub-tasks
- `synthesis.ts` - Report generation & insights

**Workers** (`apps/api/src/queue/workers/`):
- `decompose.worker.ts` - Breaks goals into tasks (BullMQ 3-attempt retry)
- `execute.worker.ts` - Executes task with worker agent
- `synthesize.worker.ts` - Generates report after completion

**Services** (`apps/api/src/services/`):
- `goalEngine.ts` - Goal lifecycle (create, update, complete)
- `assignmentEngine.ts` - Task assignment to users
- `notifier.ts` - Real-time Socket.io event broadcasting

## Troubleshooting

**API won't start?**
- Verify `.env.local` exists with all required vars
- Check ports: `lsof -i :4000` (API) and `:3000` (frontend)
- Run `npm run typecheck` to catch TypeScript errors

**Frontend can't connect to API?**
- Ensure API is running: `curl http://localhost:4000/health`
- Check browser console for Socket.io errors
- Verify `NEXT_PUBLIC_API_URL` in `.env.local`

**Tests failing?**
- Ensure Supabase credentials are valid in `.env.local`
- Check Redis connection: `curl $UPSTASH_REDIS_URL`
- Run `npm run test -- --reporter=verbose` for details

**Schema-cache errors (PGRST205 for users/goals/tasks/orgs)?**
- Apply remote schema files using Supabase CLI:
	- `SUPABASE_DB_PASSWORD=your_db_password npm run db:apply-remote`
- This command links your project from `NEXT_PUBLIC_SUPABASE_URL` and applies:
	- `packages/db/schema/001_initial.sql`
	- `packages/db/schema/002_orgos_foundation.sql`

## Deployment

### Frontend (Vercel)
```bash
npm run build   # Build Next.js static site
vercel --prod   # Deploy to Vercel
```

### Backend (Render / Railway)
```bash
# Set env vars in hosting provider
# Configure build command: npm install && npm run build
# Configure start command: npm run start
```

**.env.local Deployment**: Set in hosting provider secrets, NOT in code

## Next Steps

**Chunk 8** (Tests/Deployment - Optional):
- Add E2E tests with Playwright
- Configure GitHub Actions CI/CD
- Set up Render/Railway deployment
- Add monitoring & error tracking

**Phase 2** (Post-MVP):
- Multi-org support & tenancy
- Granular RBAC & audit trails
- LLM agent tuning & cost optimization
- Integration marketplace (Slack, Teams, etc.)

## Resources

- **Fastify**: https://www.fastify.io/docs
- **Supabase**: https://supabase.com/docs
- **BullMQ**: https://docs.bullmq.io
- **Next.js**: https://nextjs.org/docs
- **Socket.io**: https://socket.io/docs
- **Zod**: https://zod.dev

---

**Stack**: TypeScript, Turborepo, Fastify, Next.js, Supabase, Socket.io, BullMQ, Groq/Gemini LLM  
**Status**: MVP complete (Chunks 1-7), ready for local testing & deployment  
**Updated**: 2025-01
