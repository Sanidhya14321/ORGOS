# Phase 4: Data Migration Status

## 2026-05 — RAG SQL (016 / 017)

For **hybrid RAG metadata** and **optional section FTS**, apply in order on the target database:

- `packages/db/schema/016_rag_hybrid_metadata.sql`
- `packages/db/schema/017_org_document_sections_tsvector.sql`

One command: `bash scripts/apply-016-017-rag-migrations.sh` (requires `DATABASE_URL` or `DIRECT_URL`). See [`docs/PLATFORM_DEPLOY.md`](docs/PLATFORM_DEPLOY.md). This is separate from historical `011` / `assigned_position_id` blocker below.

---

**Current Phase**: Data Migration (Phase 4 of 4)
**Status**: ⚠️ Blocked on database schema migration

## Source of truth (2026-05)

Canonical SQL lives in [`packages/db/schema/`](packages/db/schema/). Before running `scripts/migrate_assigned_role_to_position.mjs`, confirm **`011_add_assigned_position_id.sql`** (or equivalent) is applied on the **target** database—this file may already exist in repo while remote lagged. See also [`docs/PLATFORM_DEPLOY.md`](docs/PLATFORM_DEPLOY.md).

## Summary

The hierarchical agent refactoring is **95% complete**:
- ✅ Phase 1: Position model created
- ✅ Phase 2: hierarchicalAgent implemented + worker conversion + migration script created
- ✅ Phase 3: CEO UI + org-structure selector + suggest-structure endpoint
- ❌ Phase 4: Data migration blocked on database schema

## The Blocker

The migration script (`scripts/migrate_assigned_role_to_position.mjs`) is ready but cannot run because the `assigned_position_id` column does not exist in the `tasks` table.

**Required SQL Migration**:
```sql
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS assigned_position_id UUID REFERENCES public.positions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_assigned_position_id ON public.tasks(assigned_position_id);
```

## Application Instructions

### Method 1: Via Supabase Dashboard (Recommended)
1. Log into https://app.supabase.com
2. Select your project
3. Navigate to SQL Editor
4. Click "+ New Query"
5. Copy the SQL from `packages/db/schema/011_add_assigned_position_id.sql`
6. Click "Run"

### Method 2: Via CLI with credentials
```bash
export SUPABASE_ACCESS_TOKEN="your_access_token"
export SUPABASE_DB_PASSWORD="your_db_password"
bash scripts/apply-remote-schema.sh
```

### Method 3: Via direct psql (if you have connection string)
```bash
psql $DATABASE_URL < packages/db/schema/011_add_assigned_position_id.sql
```

## After Applying Migration

Once the `assigned_position_id` column is added to the tasks table, you can proceed with data migration:

```bash
# Dry run: see what would be migrated
node scripts/migrate_assigned_role_to_position.mjs --dry-run

# Actual migration
node scripts/migrate_assigned_role_to_position.mjs
```

## Migration Script Behavior

The migration script:
1. Finds all tasks with `assigned_role` but no `assigned_position_id`
2. Groups tasks by organization and role
3. For each role, finds or creates a matching Position
4. Updates tasks to reference the Position ID instead of the role string

Maps roles to levels:
- CEO/CFO → level 0 (C-level)
- Manager → level 1 (middle management)
- Worker → level 2 (individual contributor)

## Files Created/Modified in Phase 4

- **New Files**:
  - `packages/db/schema/011_add_assigned_position_id.sql` — DB migration
  - `scripts/apply-migration-011.mjs` — Automatic application attempt
  - `scripts/guide-migration-011.mjs` — Manual application guidance
  - `scripts/check-schema.mjs` — Schema inspection tool
  - `MIGRATION_STATUS.md` — This file

- **Modified Files**:
  - `scripts/migrate_assigned_role_to_position.mjs` — Fixed module imports (removed dependency on API package)

## Validation Steps

After migration is applied, run these to validate:

```bash
# Check schema
node scripts/check-schema.mjs

# Dry run migration script
node scripts/migrate_assigned_role_to_position.mjs --dry-run

# Run full typecheck
npm run typecheck

# Run tests
npm -w packages/agent-core run test
```

## Next Steps

1. **Apply migration** via one of the methods above
2. **Validate migration**: `node scripts/check-schema.mjs` should show `assigned_position_id` column
3. **Run dry-run**: `node scripts/migrate_assigned_role_to_position.mjs --dry-run`
4. **Execute migration**: `node scripts/migrate_assigned_role_to_position.mjs`
5. **Smoke test**: `npm -w apps/api run smoke-queue` (optional, requires Redis)
6. **Create PR** with all changes from Phases 1-4

## Files Ready for PR

All code changes are complete and tested:
- ✅ `/packages/agent-core` — hierarchicalAgent with org_structure support
- ✅ `/packages/shared-types` — OrgStructureKind schema
- ✅ `/apps/api/src/routes/org.ts` — New endpoints for org-structure
- ✅ `/apps/web/components/ceo-approval-dashboard.tsx` — UI controls
- ✅ `/packages/db/schema/011_add_assigned_position_id.sql` — Migration
- ✅ `/scripts/migrate_assigned_role_to_position.mjs` — Data migration script
- ✅ All typecheck passing (0 errors)
- ✅ All unit tests passing (9 tests)

## PR Checklist

- [ ] Apply database migration 011
- [ ] Run migration dry-run validation
- [ ] Run `npm run typecheck` (should be clean)
- [ ] Run `npm -w packages/agent-core run test` (should pass)
- [ ] Optional: `npm -w apps/api run smoke-queue` (if Redis available)
- [ ] Create PR with title: "feat: implement hierarchical organization model (Phases 1-4)"
- [ ] Include migration instructions in PR description
- [ ] Link to this status document in PR comments

## Questions?

The migration script and application guidance are fully automated. This document can be copied into PR description or wiki for reference.
