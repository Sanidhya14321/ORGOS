#!/usr/bin/env bash
# Helper to remove local committed .env and guide git removal and secret rotation

set -euo pipefail

echo "Removing tracked .env and adding to .gitignore..."

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if [ -f .env ]; then
  git rm --cached .env || true
  rm -f .env
  echo ".env removed from working tree and staged for removal. Commit the change and push."
else
  echo ".env file not present in workspace. If it exists in git history, consider rotating keys and using 'bfg' or 'git filter-repo' to purge history (see instructions below)."
fi

echo "Ensure .env is listed in .gitignore. If committed keys were leaked, rotate them immediately in the provider consoles:"
echo "  - Supabase: rotate service role and anon keys"
echo "  - Upstash: rotate REST token"
echo "  - Groq/OpenAI: rotate API key"

cat <<'EOF'
Suggested next steps (manual):
1) Commit the removal: git commit -m "chore(secrets): remove committed .env"
2) Push to remote: git push
3) Rotate keys in the provider consoles (Supabase, Upstash, Groq, Vercel/Render).
4) If you need to scrub history, use one of:
   - BFG Repo-Cleaner: https://rtyley.github.io/bfg-repo-cleaner/
   - git filter-repo: https://github.com/newren/git-filter-repo
   Follow provider docs to invalidate/rotate keys after removal.
5) Store new secrets in your CI secret store (GitHub Actions Secrets, Vault, etc.).
EOF

exit 0
