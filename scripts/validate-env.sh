#!/usr/bin/env bash
set -euo pipefail

# Simple local environment validator for required env vars.
# Usage: ./scripts/validate-env.sh

REQUIRED=(
  SUPABASE_URL
  SUPABASE_ANON_KEY
  UPSTASH_REDIS_REST_URL
  UPSTASH_REDIS_REST_TOKEN
  OPENAI_API_KEY
)

missing=()
for v in "${REQUIRED[@]}"; do
  if [ -z "${!v:-}" ]; then
    missing+=("$v")
  fi
done

if [ ${#missing[@]} -ne 0 ]; then
  echo "ERROR: Missing required environment variables:" >&2
  for m in "${missing[@]}"; do
    echo "  - $m" >&2
  done
  echo "Copy .env.example to .env and fill values, then run: source .env && ./scripts/validate-env.sh" >&2
  exit 1
fi

echo "All required environment variables are present."
#!/usr/bin/env bash
set -euo pipefail

# Validate presence of critical environment variables used by the project.
missing=()
require() {
  if [ -z "${!1:-}" ]; then
    missing+=("$1")
  fi
}

# List of env vars expected for local development / CI smoke checks
require "NEXT_PUBLIC_SUPABASE_URL"
require "NEXT_PUBLIC_SUPABASE_ANON_KEY"
require "SUPABASE_SERVICE_ROLE_KEY"
require "UPSTASH_REDIS_REST_URL"
require "UPSTASH_REDIS_REST_TOKEN"
require "GROQ_API_KEY"
# GEMINI_API_KEY optional (fallback)

if [ ${#missing[@]} -ne 0 ]; then
  echo "Missing required env vars:" >&2
  for v in "${missing[@]}"; do
    echo " - $v" >&2
  done
  echo "Set required variables in CI secrets or .env.local" >&2
  exit 1
fi

echo "All required env vars present (basic check)."
