# Secrets rotation & CI setup

This document explains how to rotate leaked keys and configure repository secrets for CI deployments.

1) Rotate leaked keys immediately
  - Supabase
    - Go to your Supabase project > Settings > API
    - Rotate the `service_role` key and any anon keys if compromised
  - Upstash (Redis)
    - In the Upstash console find your database > Credentials > Rotate REST token
  - Groq / LLM provider
    - Revoke and create a new API key from your provider console

2) Add secrets to GitHub Actions (preferred)
  - Repo Settings > Secrets and variables > Actions
  - Add the following secrets:
    - `SUPABASE_SERVICE_ROLE_KEY`
    - `SUPABASE_ANON_KEY` (if needed for deployments)
    - `UPSTASH_REDIS_REST_TOKEN`
    - `GROQ_API_KEY`
    - `SENTRY_DSN`

3) Local development
  - Use a local `.env` file for ephemeral testing, but DO NOT commit it.
  - Use `scripts/remove-committed-secrets.sh` to remove tracked `.env` and follow the rotation steps above.

4) CI guard
  - The CI workflow will now fail pushes to `main` if required secrets are not set. This prevents accidental deploys without secrets configured.

5) History scrub (optional, advanced)
  - If keys were pushed to any remote, rotate keys first, then remove sensitive history using `git filter-repo` or BFG, and force-push. Follow provider guidance.
