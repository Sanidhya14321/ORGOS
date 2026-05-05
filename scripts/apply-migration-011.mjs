#!/usr/bin/env node
/**
 * Attempts to apply migration 011 automatically
 * Falls back to guidance if manual application is needed
 */

import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing SUPABASE credentials in .env.local');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  // Method 1: Try RPC function
  console.log('Attempting Method 1: RPC function...');
  const { error: rpcError } = await supabase.rpc('exec_sql', {
    sql: `ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS assigned_position_id UUID REFERENCES public.positions(id) ON DELETE SET NULL;`,
  });

  if (!rpcError) {
    console.log('✅ Method 1 succeeded: RPC function available');
    // Apply indexes
    await supabase.rpc('exec_sql', {
      sql: `CREATE INDEX IF NOT EXISTS idx_tasks_assigned_position_id ON public.tasks(assigned_position_id);`,
    });
    console.log('✅ Migration 011 applied successfully!');
    process.exit(0);
  }

  // Method 2: Try POST to /rest/v1/ endpoint
  console.log('❌ Method 1 failed (no RPC function)');
  console.log('Attempting Method 2: Direct REST API...');

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sql: `ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS assigned_position_id UUID REFERENCES public.positions(id) ON DELETE SET NULL;`,
      }),
    });

    if (response.ok) {
      console.log('✅ Method 2 succeeded: REST API available');
      console.log('✅ Migration 011 applied successfully!');
      process.exit(0);
    }
  } catch (err) {
    console.log('❌ Method 2 failed:', err.message);
  }

  // Fallback: Show guidance
  console.log('\n⚠️  Could not apply migration automatically.\n');
  console.log('Please apply migration manually using one of these methods:\n');

  const migrationPath = path.resolve(__dirname, '..', 'packages', 'db', 'schema', '011_add_assigned_position_id.sql');
  const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

  console.log('SQL to execute:');
  console.log('─'.repeat(60));
  console.log(migrationSQL);
  console.log('─'.repeat(60));
  console.log('\nOptions:');
  console.log('1. Supabase Dashboard: SQL Editor → New Query → Copy SQL above');
  console.log('2. Command line: run "node scripts/guide-migration-011.mjs" for more options');

  process.exit(1);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
