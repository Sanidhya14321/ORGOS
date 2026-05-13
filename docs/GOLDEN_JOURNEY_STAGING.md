# Golden journey (staging / demo)

Scripted path for **non-dev** validation of ORGOS end-to-end. Replace placeholders with your staging host and test accounts.

## Preconditions

- Staging API URL (`ORGOS_SMOKE_API_URL` or browser base).  
- CEO test user (completed onboarding, owns org).  
- Optional: second user for approvals (per feature).

## Steps

1. **Open web app** — `https://<WEB_HOST>/login`  
2. **Log in** as CEO test user.  
3. **Goals** — `/dashboard/goals` → create one goal (title + description).  
4. **Knowledge base** — `/dashboard/knowledge` (CEO) → upload a small PDF or `.txt` handbook → confirm list shows file, `ingestion_warnings` empty or explained, indexed flag when present.  
5. **Smart input** — `/dashboard/capture` → parse plain-language item → create linked task or goal per UI.  
6. **Task board** — `/dashboard/task-board` → confirm new task appears.  
7. **Org tree** — `/dashboard/org-tree` → confirm org visible (smoke for hierarchy UI).

## Failure signals

- Upload shows **parse warnings** or **embedding not enqueued** message → read inline UI copy; check API response `ingestion_warnings` / `embedding_enqueued`.  
- 401 loops → cookie / `NEXT_PUBLIC_API_URL` mismatch.  
- Degraded health → `GET /health` on API; fix Redis/DB before demo.

## Automation

- API health: `ORGOS_SMOKE_API_URL=<api> node scripts/smoke-local.js`  
- Full API test suite: `npm test` from repo root  
