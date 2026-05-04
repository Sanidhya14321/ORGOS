---
title: "E2E Smoke Tests Setup Guide"
description: "Local development E2E tests using ephemeral Supabase + Upstash (no Docker)"
---

# E2E Smoke Tests Guide

This guide covers setting up and running smoke tests for the ORGOS platform locally without Docker.

## Quick Start

### Prerequisites
- Node.js 18+ (from `.node-version`)
- Free Supabase account (https://supabase.com)
- Free Upstash account (https://upstash.com)

### 1. Create Ephemeral Supabase Project

**Via Web UI:**
1. Go to https://supabase.com → Dashboard
2. Click "New project"
3. Choose region (closest to you), project name: `orgos-e2e-test`
4. Set password (any value, for testing)
5. Wait ~5 min for setup

**Via Supabase CLI (fastest):**
```bash
# Install if needed
npm install -g @supabase/cli

# Create project (adds to .supabase/config.json)
supabase projects create --name "orgos-e2e-test" --region us-east-1

# Wait for init, then get credentials
supabase projects api-keys --project-id <PROJECT_ID>
```

**Credentials to copy:**
- `SUPABASE_URL` = Project URL (looks like `https://xxxx.supabase.co`)
- `SUPABASE_ANON_KEY` = anon/public key (Settings → API)
- `SUPABASE_SERVICE_ROLE_KEY` = service_role key (Settings → API, needs role selector)

### 2. Create Ephemeral Upstash Redis

**Via Web UI:**
1. Go to https://console.upstash.com → Create → Redis
2. Choose region, plan: "Free (1GB)"
3. Name: `orgos-e2e-test`
4. Click "Create"
5. Copy credentials from "REST API" tab

**Credentials to copy:**
- `UPSTASH_REDIS_REST_URL` = REST URL (looks like `https://xxxx.upstash.io`)
- `UPSTASH_REDIS_REST_TOKEN` = Authorization token

### 3. Bootstrap Database Schema

```bash
# Option A: Using Supabase CLI
supabase db push --project-id <PROJECT_ID> supabase/migrations/*

# Option B: Import via UI
# Supabase Dashboard → SQL Editor → New Query → Paste migration SQL
```

### 4. Update .env for Testing

```bash
cp .env.example .env

# Fill in ephemeral credentials
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=eyJxxx...
SUPABASE_SERVICE_ROLE_KEY=eyJxxx...
UPSTASH_REDIS_REST_URL=https://xxxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=AZxxx...

# API config
NEXT_PUBLIC_API_URL=http://localhost:4000
GROQ_API_KEY=gsk_xxx...  # For LLM tests
GEMINI_API_KEY=AIzaxx...  # Optional fallback

# Sentry (optional)
SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/yyy
```

### 5. Run Smoke Tests

**Local test (interactive API):**
```bash
# Terminal 1: Start API
npm --prefix apps/api run dev

# Terminal 2: Run smoke tests
node scripts/e2e-smoke.mjs
```

**Expected output:**
```
=== E2E Smoke Tests ===

[TEST] API health check...
[PASS] API health check
[TEST] Supabase connection...
[PASS] Supabase connection
[TEST] Upstash Redis connection...
[PASS] Upstash Redis connection
[TEST] Auth login endpoint...
[PASS] Auth login endpoint
[TEST] Prometheus metrics endpoint...
[PASS] Prometheus metrics endpoint

=== Results: 5 passed, 0 failed ===
```

**CI integration test (with GitHub Actions):**
```bash
# Runs in .github/workflows/ci.yml as part of build-and-test job
npm --prefix apps/api run smoke:integration
```

## Test Structure

### Health Checks

**GET /healthz**
```json
{
  "status": "ok|degraded",
  "db": "fulfilled|rejected",
  "redis": "fulfilled|rejected",
  "uptime": 12.345,
  "timestamp": "2025-03-15T10:00:00Z"
}
```

### Authentication Flow

**POST /api/auth/login**
- Test: valid email/password
- Expected: 200 (success) or 401 (wrong password)
- Invalid request: 400 (validation error)

### Metrics Export

**GET /metrics**
- Content-Type: `text/plain; version=0.0.4`
- Format: Prometheus text format
- Expected: Lines starting with `# HELP`, `# TYPE`, or metric values

### Database Connectivity

- Supabase: SELECT count FROM users
- Redis: PING → PONG

## Cleanup

### Delete Ephemeral Projects (To Save Costs)

**Supabase:**
```bash
# Via CLI
supabase projects delete --project-id <PROJECT_ID>

# Via UI: Dashboard → Project Settings → Delete Project
```

**Upstash:**
```bash
# Via CLI (if configured)
upstash redis delete --id <REDIS_ID>

# Via UI: Console → Database → Delete
```

## Troubleshooting

### "Failed to fetch"
**Cause**: API not running or wrong `NEXT_PUBLIC_API_URL`
**Fix**: Start API with `npm --prefix apps/api run dev`

### "Missing SUPABASE_URL"
**Cause**: `.env` not created or incomplete
**Fix**: Copy `.env.example`, fill in ephemeral credentials

### "Redis ping failed"
**Cause**: Wrong token or Upstash project not accessible
**Fix**: Verify `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` in console

### "Health check not ok"
**Cause**: Database or Redis connectivity issue
**Fix**: Check `/healthz` endpoint for `db` and `redis` status

### "Metrics response invalid"
**Cause**: `/metrics` endpoint not wired or prom-client not available
**Fix**: Ensure `packages/agent-core/src/llm/metrics.ts` is initialized

## Advanced: CI Ephemeral Setup (GitHub Actions)

To automatically create ephemeral projects in CI:

**Option 1: GitHub Actions Marketplace**
```yaml
- uses: supabase-community/supabase-preview-action@v0
  with:
    supabase_url: ${{ secrets.SUPABASE_URL }}
    supabase_key: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
```

**Option 2: Manual API calls**
```bash
# Supabase API
curl -X POST https://api.supabase.com/v1/projects \
  -H "Authorization: Bearer $SUPABASE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "orgos-ci-'"$GITHUB_RUN_ID"'"}'

# Upstash API
curl -X POST https://api.upstash.com/v2/redis \
  -H "Authorization: Bearer $UPSTASH_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "orgos-ci-'"$GITHUB_RUN_ID"'", "region": "us-east-1"}'
```

## Metrics & Monitoring

### Test Coverage

| Component | Test |
|-----------|------|
| API health | `/healthz` endpoint |
| Database | Supabase user SELECT |
| Cache | Upstash PING |
| Auth | POST /api/auth/login |
| Metrics | GET /metrics (Prometheus) |

### Success Criteria

- ✅ All 5 smoke tests pass
- ✅ API responds < 2 seconds
- ✅ Database query succeeds
- ✅ Cache (Redis) responds
- ✅ Metrics endpoint returns valid Prometheus format

### Duration

Expected run time: **10–30 seconds** (depends on network latency)

## References

- [Supabase Setup](https://supabase.com/docs/guides/getting-started/quickstarts/nextjs)
- [Upstash Redis](https://upstash.com/docs/redis/features/rest-api)
- [Prometheus Metrics Format](https://prometheus.io/docs/instrumenting/exposition_formats/)
- [VELOCITY_LABS_LOGIN_README.md](../../VELOCITY_LABS_LOGIN_README.md) - Test credentials
