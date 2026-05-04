#!/usr/bin/env bash
# Simple repo secret scanner for common tokens (exit 1 when matches found)
# Intended for local use and as a CI gate. Not a replacement for specialized tools.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "Running lightweight secret scan..."

# Patterns: base64-ish, common provider keywords, and known project keys
PATTERNS=(
  "SUPABASE_SERVICE_ROLE_KEY"
  "SUPABASE_ANON_KEY"
  "GROQ_API_KEY"
  "UPSTASH_REDIS"
  "UPSTASH_REDIS_TOKEN"
  "-----BEGIN PRIVATE KEY-----"
  "AKIA[0-9A-Z]{16}"
)

MATCHES=0

for p in "${PATTERNS[@]}"; do
  # use grep -RIn --exclude paths to avoid node_modules and build output
  if grep -RIn --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next -E "$p" .; then
    MATCHES=$((MATCHES+1))
  fi
done

if [ "$MATCHES" -gt 0 ]; then
  echo "ERROR: Potential secrets detected. Please remove sensitive values and rotate leaked keys." >&2
  exit 1
fi

echo "No obvious secrets found by lightweight scan. For robust checks, install 'git-secrets' or 'truffleHog'."
