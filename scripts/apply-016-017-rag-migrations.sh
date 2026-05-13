#!/usr/bin/env bash
# Apply RAG-related migrations 016 then 017 in order (hybrid metadata → section tsvector + RPC).
# Requires same env as single-file scripts: DATABASE_URL or DIRECT_URL for psql.
#
#   export DATABASE_URL="postgres://..."
#   bash scripts/apply-016-017-rag-migrations.sh
#
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
bash "${ROOT_DIR}/scripts/apply-016-rag-migration.sh"
bash "${ROOT_DIR}/scripts/apply-017-tsvector-migration.sh"
echo "016 + 017 apply complete."
