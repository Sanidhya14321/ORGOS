#!/usr/bin/env bash
# Apply packages/db/schema/016_rag_hybrid_metadata.sql to Postgres (requires pgvector + prior schema).
#
# Option A — direct Postgres URL:
#   export DATABASE_URL="postgres://USER:PASS@HOST:5432/DBNAME"
#   bash scripts/apply-016-rag-migration.sh
#
# Option B — Supabase CLI (linked project):
#   npx supabase db query --linked --file packages/db/schema/016_rag_hybrid_metadata.sql
#
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SQL_FILE="${ROOT_DIR}/packages/db/schema/016_rag_hybrid_metadata.sql"

if [[ ! -f "$SQL_FILE" ]]; then
  echo "Missing migration file: $SQL_FILE" >&2
  exit 1
fi

if [[ -n "${DATABASE_URL:-}" ]]; then
  echo "Applying 016 via DATABASE_URL -> psql"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$SQL_FILE"
  echo "016 apply complete."
  exit 0
fi

if [[ -n "${DIRECT_URL:-}" ]]; then
  echo "Applying 016 via DIRECT_URL -> psql"
  psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f "$SQL_FILE"
  echo "016 apply complete."
  exit 0
fi

echo "No DATABASE_URL or DIRECT_URL set." >&2
echo "Set one of them, or run manually:" >&2
echo "  psql \"\$DATABASE_URL\" -v ON_ERROR_STOP=1 -f packages/db/schema/016_rag_hybrid_metadata.sql" >&2
echo "Or with Supabase CLI (linked):" >&2
echo "  npx supabase db query --linked --file packages/db/schema/016_rag_hybrid_metadata.sql" >&2
exit 1
