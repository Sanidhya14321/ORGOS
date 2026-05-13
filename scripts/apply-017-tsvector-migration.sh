#!/usr/bin/env bash
# Apply packages/db/schema/017_org_document_sections_tsvector.sql (FTS on org_document_sections).
#
#   export DATABASE_URL="postgres://USER:PASS@HOST:5432/DBNAME"
#   bash scripts/apply-017-tsvector-migration.sh
#
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SQL_FILE="${ROOT_DIR}/packages/db/schema/017_org_document_sections_tsvector.sql"

if [[ ! -f "$SQL_FILE" ]]; then
  echo "Missing migration file: $SQL_FILE" >&2
  exit 1
fi

if [[ -n "${DATABASE_URL:-}" ]]; then
  echo "Applying 017 via DATABASE_URL -> psql"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$SQL_FILE"
  echo "017 apply complete."
  exit 0
fi

if [[ -n "${DIRECT_URL:-}" ]]; then
  echo "Applying 017 via DIRECT_URL -> psql"
  psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f "$SQL_FILE"
  echo "017 apply complete."
  exit 0
fi

echo "No DATABASE_URL or DIRECT_URL set." >&2
exit 1
