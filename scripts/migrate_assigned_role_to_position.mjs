#!/usr/bin/env node
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import the repo's Supabase client helper
const clientsPath = path.join(__dirname, '..', 'apps', 'api', 'src', 'lib', 'clients.js');
const envPath = path.join(__dirname, '..', 'apps', 'api', 'src', 'config', 'env.js');

const { createSupabaseServiceClient } = await import(`file://${clientsPath}`);
const { readEnv } = await import(`file://${envPath}`);

const roleLevelMap = {
  ceo: 0,
  cfo: 0,
  manager: 1,
  worker: 2,
};

function parseFlags(argv) {
  return {
    dryRun: argv.includes('--dry-run') || argv.includes('-n'),
  };
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const env = readEnv();
  const supabase = createSupabaseServiceClient(env);

  console.log('Starting migration: assigned_role -> assigned_position_id');
  if (flags.dryRun) {
    console.log('Running in DRY RUN mode (no writes will be performed).');
  }

  // Find tasks needing migration
  const { data: tasks, error: taskErr } = await supabase
    .from('tasks')
    .select('id, org_id, assigned_role')
    .not('assigned_role', 'is', null)
    .is('assigned_position_id', null);

  if (taskErr) {
    console.error('Failed to fetch tasks for migration', taskErr.message);
    process.exit(1);
  }

  if (!tasks || tasks.length === 0) {
    console.log('No tasks require migration. Exiting.');
    process.exit(0);
  }

  const byOrg = new Map();
  for (const t of tasks) {
    const org = String(t.org_id ?? 'global');
    if (!byOrg.has(org)) byOrg.set(org, new Set());
    if (t.assigned_role && roleLevelMap[t.assigned_role] !== undefined) byOrg.get(org).add(t.assigned_role);
  }

  const summary = [];

  for (const [orgId, roles] of byOrg.entries()) {
    console.log(`Processing org ${orgId} with roles: ${[...roles].join(', ')}`);

    for (const role of roles) {
      // Try find existing position
      const positionLookup = supabase
        .from('positions')
        .select('id, title, level')
        .eq('org_id', orgId === 'global' ? '' : orgId)
        .ilike('title', role)
        .limit(1)
        .maybeSingle();

      const { data: existing, error: posErr } = orgId === 'global'
        ? { data: null, error: null }
        : await positionLookup;

      if (posErr) {
        console.warn('Position lookup failed', posErr.message);
        continue;
      }

      let positionId = existing?.id;

      if (!positionId) {
        if (orgId === 'global') {
          console.warn('Skipping global/no-org tasks for role', role, '- tasks must belong to an organization to map positions.');
          continue;
        }

        if (flags.dryRun) {
          console.log(`[DRY RUN] Would create position '${role.toUpperCase()}' for org ${orgId}`);
          continue;
        }

        const { data: created, error: createErr } = await supabase
          .from('positions')
          .insert({
            org_id: orgId,
            title: role.toUpperCase(),
            level: roleLevelMap[role],
            is_custom: false,
            confirmed: true
          })
          .select('id')
          .single();

        if (createErr || !created) {
          console.warn('Failed to create position for', role, createErr?.message ?? 'unknown');
          continue;
        }

        positionId = created.id;
        console.log(`Created position '${role}' → id=${positionId}`);
      } else {
        console.log(`Found existing position for '${role}' → id=${positionId}`);
      }

      // Update tasks for this org and role
      if (flags.dryRun) {
        const { data: toUpdate, error: countErr } = await supabase
          .from('tasks')
          .select('id')
          .eq('org_id', orgId === 'global' ? null : orgId)
          .eq('assigned_role', role)
          .is('assigned_position_id', null);

        if (countErr) {
          console.warn('Failed to count dry-run updates for role', role, countErr.message);
          continue;
        }

        summary.push({ orgId, role, updated: (toUpdate ?? []).length, positionId: positionId ?? '[would-resolve-after-create]' });
        continue;
      }

      const { data: updated, error: updateErr } = await supabase
        .from('tasks')
        .update({ assigned_position_id: positionId })
        .eq('org_id', orgId === 'global' ? null : orgId)
        .eq('assigned_role', role)
        .is('assigned_position_id', null)
        .select('id');

      if (updateErr) {
        console.warn('Failed to update tasks for role', role, updateErr.message);
        continue;
      }

      summary.push({ orgId, role, updated: (updated ?? []).length, positionId });
    }
  }

  console.log('Migration summary:');
  console.table(summary);
  console.log('Migration complete. Keep assigned_role until rollout is validated.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Migration failed', err);
  process.exit(1);
});
