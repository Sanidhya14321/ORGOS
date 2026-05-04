CI for ORGOS

What this CI does

- Runs typecheck across the monorepo via `npm run typecheck` (turbo)
- Builds `packages/agent-core` and packs it into a tarball
- Runs tests and builds the overall monorepo
- Uploads `agent-core` tarball as an artifact for downstream jobs

Required environment variables (set as GitHub secrets or via your CI provider / vault):

- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY (or appropriate service credential for migrations)
- UPSTASH_REDIS_REST_URL
- UPSTASH_REDIS_REST_TOKEN
- SENTRY_DSN (optional, for error reporting)
- OPENAI_API_KEY (or other LLM provider keys you use)
- INTERNAL_REGISTRY_URL (optional for internal npm registry)
- NPM_TOKEN (if publishing to registry)

OIDC / cloud deploy notes

This repository enables `id-token: write` in the workflow permissions so you can use GitHub OIDC to obtain short-lived credentials for cloud providers instead of long-lived secrets.

- For GCP: configure a Workload Identity Provider and map repository/workflow to a service account.
- For Azure: configure federated credentials on an Azure AD app registration and use `azure/login` GitHub Action.
- For AWS: configure an IAM OIDC provider and use `aws-actions/configure-aws-credentials`.

Replace workflow action references with pinned commit SHAs for production security. See `.github/workflows/secrets.example` for the minimal set of secret names to configure in the repo settings or your vault.
