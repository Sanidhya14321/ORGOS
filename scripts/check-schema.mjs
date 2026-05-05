#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env.local for local development
dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  // Check schema of tasks table
  const { data, error } = await supabase
    .from('information_schema.columns')
    .select('column_name, data_type')
    .eq('table_schema', 'public')
    .eq('table_name', 'tasks');

  if (error) {
    console.error('Error querying schema:', error.message);
    // Try raw query approach
    console.log('\nAttempting to inspect tasks table by querying one row...');
    
    const { data: sampleTask, error: sampleError } = await supabase
      .from('tasks')
      .select('*')
      .limit(1);
    
    if (sampleError) {
      console.error('Error fetching sample task:', sampleError.message);
    } else if (sampleTask && sampleTask.length > 0) {
      console.log('Sample task columns:', Object.keys(sampleTask[0]).sort());
    }
    process.exit(1);
  }

  console.log('Tasks table columns:');
  data?.forEach(col => {
    console.log(`  - ${col.column_name}: ${col.data_type}`);
  });

  const hasAssignedPositionId = data?.some(col => col.column_name === 'assigned_position_id');
  if (!hasAssignedPositionId) {
    console.log('\n⚠️  assigned_position_id column is MISSING');
    console.log('Run: node scripts/apply-migration-011.mjs');
  } else {
    console.log('\n✓ assigned_position_id column exists');
  }
}

main();
