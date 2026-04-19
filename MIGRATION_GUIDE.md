# ORGOS Remote Database Migration Guide

## Current Status

✅ **Completed:**
- Local schema files created (`001_initial.sql`, `002_orgos_foundation.sql`, `003_ancestors_rls.sql`)
- Velocity Labs seed script created (`packages/db/seeds/velocity_labs_org.ts`)
- API server configured and running with fallback queue handling
- Auth endpoints verified working
- Frontend complete-profile UX updated with role-based options

⚠️ **Blocked on:**
- Remote database schema migrations (need `SUPABASE_ACCESS_TOKEN`)
- Velocity Labs organization seeding (depends on migrations)

## Prerequisites

You'll need:
1. **SUPABASE_DB_PASSWORD** - Already set in `.env`
2. **SUPABASE_ACCESS_TOKEN** - Get from https://app.supabase.com/account/tokens

## Step 1: Get Your Supabase Access Token

1. Go to [https://app.supabase.com/account/tokens](https://app.supabase.com/account/tokens)
2. Sign in to your Supabase account
3. Click "Create New Token"
4. Name it (e.g., "ORGOS Migration")
5. Copy the token

## Step 2: Set the Token

```bash
export SUPABASE_ACCESS_TOKEN="your-token-here"
```

Or add it to your `.env` file:
```
SUPABASE_ACCESS_TOKEN=your-token-here
```

## Step 3: Apply Remote Migrations

```bash
cd /home/sanidhya-vats/Desktop/ORGOS
set -a && source .env && set +a
npm run db:apply-remote
```

This will:
- Link to your Supabase project
- Apply `001_initial.sql` - Creates base tables and authentication
- Apply `002_orgos_foundation.sql` - Creates org/position/goal/task tables
- Apply `003_ancestors_rls.sql` - Creates RLS policies for hierarchy

Expected output:
```
Linking Supabase project: nolyygjzyjznunpftlwa
Applying schema/001_initial.sql
Applying schema/002_orgos_foundation.sql
Applying schema/003_ancestors_rls.sql
Remote schema apply complete.
```

## Step 4: Seed Velocity Labs Organization

Once migrations are applied:

```bash
cd /home/sanidhya-vats/Desktop/ORGOS
set -a && source .env.local && set +a
npm --workspace @orgos/db run seed:velocity
```

This creates:
- 50 users (1 CEO, 1 CFO, 5 managers, 43 workers)
- Organization "ORGOS Velocity Labs"
- Goal/task templates for each department
- Default positions and role hierarchies

Credentials are in `VELOCITY_LABS_LOGIN_README.md`

## Step 5: Verify Everything Works

```bash
# Test org creation endpoint
curl -X POST http://localhost:4000/api/orgs/create \
  -H "origin: http://localhost:3000" \
  -H "content-type: application/json" \
  --data '{"name":"Test Org","domain":"test.orgos.ai","makeCreatorCeo":true}'

# Should return 201 with org data (not 503)
```

## Troubleshooting

### Connection Timeout
If you get a timeout connecting to Supabase:
- Check your firewall allows connections to `nolyygjzyjznunpftlwa.supabase.co:5432`
- Verify the credentials in `.env` are correct
- Try the CLI again: `npm run db:apply-remote`

### Migration Errors
If a migration fails:
1. Check the error message - it usually indicates which constraint/table failed
2. Visit https://app.supabase.com/project/nolyygjzyjznunpftlwa/sql/templates to manually review
3. You can try running individual migration files manually if needed

### Already Exists Errors
These are safe - the migrations gracefully handle idempotency. Just re-run the seed script.

## Files Involved

- **Migration scripts**: `packages/db/schema/*.sql`
- **Seed script**: `packages/db/seeds/velocity_labs_org.ts`
- **Credentials**: `VELOCITY_LABS_LOGIN_README.md`
- **Migration runner**: `scripts/apply-remote-schema.sh`

## Next Steps After Migrations

1. ✅ Local development: Velocity Labs org will be seeded in Supabase
2. ✅ Test org creation via UI
3. ✅ Login as CEO/CFO/manager/worker and verify role-based flows
4. ✅ Run complete-profile onboarding for different roles
5. ✅ Deploy to production (update env vars for production Supabase)
