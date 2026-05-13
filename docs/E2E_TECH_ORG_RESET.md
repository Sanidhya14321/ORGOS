# E2E: wipe Supabase, schema, tech org seed, AI PDF, knowledge upload

**Target:** non-production Supabase + same project Postgres (pooler). Destructive on the project pointed to by `SUPABASE_URL`.

## 0) Preconditions

- Root `.env` / `.env.local`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `UPSTASH_REDIS_URL`, `UPSTASH_REDIS_TOKEN`, `SUPABASE_DB_PASSWORD` (for direct schema apply), LLM keys as needed.
- Optional: `OPENAI_API_KEY` — richer handbook text in `npm run e2e:generate-handbook-pdf`; without it the script uses a static realistic handbook.

## 1) Wipe all app data + Auth users

```bash
ORGOS_CONFIRM_E2E_RESET=1 npm run db:reset-nonprod
```

Refuses to run unless `ORGOS_CONFIRM_E2E_RESET=1` (deletes every row in listed `public` tables and all Supabase Auth users).

## 2) Re-apply SQL schema (sorted `packages/db/schema/*.sql`)

**Preferred (direct Postgres via pooler — no access token):**

```bash
npm run db:apply-remote-direct
```

**Alternative (Supabase CLI linked project):**

```bash
SUPABASE_ACCESS_TOKEN=… SUPABASE_DB_PASSWORD=… npm run db:apply-remote
```

RAG migrations `016` / `017` are included in sorted schema files when present.

## 3) Seed Nexus Tech Solutions org

```bash
npm run db:seed:tech-e2e
```

Defaults: org **Nexus Tech Solutions**, domain `nexustech.solutions`, emails `*@nexustech.e2e`, password for each user equals their email (CEO `ceo@nexustech.e2e`).

Override with env: `SEED_ORG_NAME`, `SEED_ORG_DOMAIN`, `SEED_USER_EMAIL_DOMAIN`.

## 4) Generate handbook PDF

```bash
npm run e2e:generate-handbook-pdf
```

Output: `tmp/e2e/nexus-tech-employee-handbook.pdf` (gitignored). Override with `OUT_PATH=...`.

## 5) Start stack and upload PDF (CEO session)

Terminal A — Redis (if not using Upstash-only for dev):

```bash
npm run dev:redis-local
```

Terminal B — API:

```bash
npm --workspace @orgos/api run dev
```

Terminal C — upload:

```bash
API_URL=http://localhost:4000 npm run e2e:upload-knowledge-pdf
```

Optional: `E2E_ORG_ID`, `E2E_CEO_EMAIL`, `E2E_CEO_PASSWORD`, `PDF_PATH`, `E2E_DOCUMENT_RETRIEVAL_MODE` (default `vectorless`; use `hybrid` when API has `OPENAI_API_KEY`).

## 6) Smoke checks

**Local infra optional skips** (Supabase cloud + Upstash only, no local Postgres/Redis):

```bash
ORGOS_SMOKE_SKIP_POSTGRES=1 ORGOS_SMOKE_SKIP_REDIS=1 npm run smoke:local
```

**Remote API health:**

```bash
ORGOS_SMOKE_API_URL=https://your-api-host npm run smoke:local
```

## 7) Golden journey (manual UI)

Follow [GOLDEN_JOURNEY_STAGING.md](./GOLDEN_JOURNEY_STAGING.md): login CEO (`ceo@nexustech.e2e` / password = email), goals, knowledge (confirm uploaded doc), capture, task board, org tree.

## One-liner reference (copy with care)

```bash
ORGOS_CONFIRM_E2E_RESET=1 npm run db:reset-nonprod && \
  npm run db:apply-remote-direct && \
  npm run db:seed:tech-e2e && \
  npm run e2e:generate-handbook-pdf
```

Then start API + `npm run e2e:upload-knowledge-pdf`.
