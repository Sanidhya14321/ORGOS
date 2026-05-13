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

Defaults: org **Nexus Tech Solutions**, domain `nexustech.solutions`, emails `*@nexustech-e2e.org`, password for each user equals their email (CEO `ceo@nexustech-e2e.org`).

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

Follow [GOLDEN_JOURNEY_STAGING.md](./GOLDEN_JOURNEY_STAGING.md): login CEO (`ceo@nexustech-e2e.org` / password = email), goals, knowledge (confirm uploaded doc), capture, task board, org tree.

## One-liner reference (copy with care)

```bash
ORGOS_CONFIRM_E2E_RESET=1 npm run db:reset-nonprod && \
  npm run db:apply-remote-direct && \
  npm run db:seed:tech-e2e && \
  npm run e2e:generate-handbook-pdf
```

Then start API + `npm run e2e:upload-knowledge-pdf`.

---

## Credentials (default seed; password rule) {#credentials}

**Rule:** Auth password for every seeded user **equals full email** (Supabase `createUser` in seed). Web + `POST /api/auth/login` use same.

**Email domain:** `nexustech-e2e.org` unless you set `SEED_USER_EMAIL_DOMAIN` (must pass API `z.email()` — avoid fake TLDs like `.e2e`).

| Login (email) | Password | Role | Notes |
|----------------|----------|------|--------|
| `ceo@nexustech-e2e.org` | `ceo@nexustech-e2e.org` | CEO | Document upload, golden journey CEO path |
| `cfo@nexustech-e2e.org` | `cfo@nexustech-e2e.org` | CFO | |
| `vp.engineering@nexustech-e2e.org` | same as email | Manager | |
| `vp.customer_success@nexustech-e2e.org` | same as email | Manager | |
| `engineer.1@nexustech-e2e.org` … `engineer.3@…` | same as email | Worker | |
| `csm.1@nexustech-e2e.org` … `csm.3@…` | same as email | Worker | |

**Org:** name `Nexus Tech Solutions`, domain `nexustech.solutions` (override with `SEED_ORG_NAME` / `SEED_ORG_DOMAIN`). **Org UUID:** not fixed — use `GET /api/me` as CEO (returns `org_id`) or read seed script stdout (`Tech E2E seed complete: … (uuid)`).

**Web:** point `NEXT_PUBLIC_API_URL` (or app’s API base) at same host as API (`e2e-upload-knowledge-pdf` uses `API_URL` / `NEXT_PUBLIC_API_URL`, default `http://localhost:4000`).

**Upload script overrides:** `E2E_CEO_EMAIL`, `E2E_CEO_PASSWORD` (defaults: email + password=email).

---

## Errors & fixes (common)

| Symptom | Likely cause | Fix |
|--------|----------------|-----|
| `Refusing reset: set ORGOS_CONFIRM_E2E_RESET=1` | Guard on wipe | Export `ORGOS_CONFIRM_E2E_RESET=1` then `npm run db:reset-nonprod` |
| `Missing SUPABASE_ACCESS_TOKEN` | `db:apply-remote` needs CLI token | Use `npm run db:apply-remote-direct` with `SUPABASE_DB_PASSWORD` + `supabase/.temp/pooler-url`, or set token + password for `db:apply-remote` |
| `Missing required env var: SUPABASE_URL` (seed / scripts) | `tsx` cwd misses `.env` | Run seeds via `npm run db:seed:tech-e2e` from **repo root** (loads root `.env`) |
| `connect ECONNREFUSED 127.0.0.1:5432` / `:6379` from `smoke:local` | No local Postgres/Redis | `ORGOS_SMOKE_SKIP_POSTGRES=1 ORGOS_SMOKE_SKIP_REDIS=1 npm run smoke:local` and/or `ORGOS_SMOKE_API_URL=…` for remote health only |
| Login `400` `Invalid login payload` / `email` `Invalid email` | Seed used non-DNS-looking domain (e.g. `.e2e`) | Default seed domain is `nexustech-e2e.org`. Re-seed after pull, or set `SEED_USER_EMAIL_DOMAIN` to a valid-looking host + `npm run db:seed:tech-e2e` |
| `No orgos_access_token in Set-Cookie` | Cookie parse / proxy stripped headers | Use Node 18+; hit API directly; check login response body still 200 |
| Upload `403` `Only CEO can upload` | Logged-in user not CEO | Use CEO email or `E2E_CEO_EMAIL` |
| Upload `404` `Organization not found` | `documents` route requires `orgs.created_by ===` CEO user id | Run `npm run db:seed:tech-e2e` again (seeds now patch `created_by`); or SQL: `update orgs set created_by = '<ceo_user_uuid>' where id = '<org_id>'` |
| Hybrid upload + `ingestion_warnings` / no embedding | No `OPENAI_API_KEY` on API | Keep default `E2E_DOCUMENT_RETRIEVAL_MODE=vectorless` for script; or set key + `hybrid` |
| `ORGOS_SECTION_TSVECTOR=1` + empty / errors | Migration `017` not applied | Apply schema / `017` RPC exists before flag |
| `listen EADDRINUSE ... :4000` | Old API still bound | `fuser -k 4000/tcp` (Linux) or stop prior `tsx watch` |
| `SESSION_LIMITED` / `429` on login | Too many sessions for role | Clear old sessions or wait; see auth route limits for CEO/CFO |

---

## After seed: API upload (verify)

```bash
# Terminal 1 (if local BullMQ needs Redis)
npm run dev:redis-local

# Terminal 2
npm --workspace @orgos/api run dev

# Terminal 3 (from repo root)
API_URL=http://localhost:4000 npm run e2e:upload-knowledge-pdf
```

Expect HTTP **201** and JSON with document id / ingestion hints. Then confirm in UI under **Knowledge** as CEO.
