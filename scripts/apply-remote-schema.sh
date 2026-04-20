#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

read_env() {
  local key="$1"
  local val
  val=$(grep -h "^${key}=" .env.local .env 2>/dev/null | tail -n1 | cut -d= -f2- || true)
  val="${val%\"}"
  val="${val#\"}"
  printf '%s' "$val"
}

SUPABASE_URL="$(read_env NEXT_PUBLIC_SUPABASE_URL)"
DB_PASSWORD="${SUPABASE_DB_PASSWORD:-$(read_env SUPABASE_DB_PASSWORD)}"
ACCESS_TOKEN="${SUPABASE_ACCESS_TOKEN:-$(read_env SUPABASE_ACCESS_TOKEN)}"

if [[ -z "$SUPABASE_URL" ]]; then
  echo "Missing NEXT_PUBLIC_SUPABASE_URL in .env.local/.env" >&2
  exit 1
fi

if [[ -z "$DB_PASSWORD" ]]; then
  echo "Missing SUPABASE_DB_PASSWORD env var." >&2
  echo "Set it for this command only, e.g.:" >&2
  echo "SUPABASE_DB_PASSWORD=your_db_password npm run db:apply-remote" >&2
  exit 1
fi

if [[ -z "$ACCESS_TOKEN" ]]; then
  echo "Missing SUPABASE_ACCESS_TOKEN env var." >&2
  echo "Set it in .env/.env.local or export it before running db:apply-remote." >&2
  exit 1
fi

project_ref=$(echo "$SUPABASE_URL" | sed -E 's#https?://([^.]+)\..*#\1#')
if [[ -z "$project_ref" || "$project_ref" == "$SUPABASE_URL" ]]; then
  echo "Could not extract Supabase project ref from NEXT_PUBLIC_SUPABASE_URL" >&2
  exit 1
fi

echo "Linking Supabase project: $project_ref"
SUPABASE_ACCESS_TOKEN="$ACCESS_TOKEN" npx supabase link --project-ref "$project_ref" --password "$DB_PASSWORD"

echo "Applying schema/001_initial.sql"
SUPABASE_ACCESS_TOKEN="$ACCESS_TOKEN" SUPABASE_DB_PASSWORD="$DB_PASSWORD" npx supabase db query --linked --file packages/db/schema/001_initial.sql

echo "Applying schema/002_orgos_foundation.sql"
SUPABASE_ACCESS_TOKEN="$ACCESS_TOKEN" SUPABASE_DB_PASSWORD="$DB_PASSWORD" npx supabase db query --linked --file packages/db/schema/002_orgos_foundation.sql

echo "Applying schema/003_ancestors_rls.sql"
SUPABASE_ACCESS_TOKEN="$ACCESS_TOKEN" SUPABASE_DB_PASSWORD="$DB_PASSWORD" npx supabase db query --linked --file packages/db/schema/003_ancestors_rls.sql

echo "Remote schema apply complete."
