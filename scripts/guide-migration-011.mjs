#!/usr/bin/env node
/**
 * Helper script to guide manual application of migration 011
 * This migration adds assigned_position_id column to tasks table
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('📋 Migration 011: Add assigned_position_id to tasks table\n');
console.log('Status: This column is MISSING from your database\n');

const migrationPath = path.resolve(__dirname, '..', 'packages', 'db', 'schema', '011_add_assigned_position_id.sql');
const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

console.log('SQL to execute:');
console.log('─'.repeat(60));
console.log(migrationSQL);
console.log('─'.repeat(60));

console.log('\n✨ Application Options:\n');

console.log('Option 1: Via Supabase Dashboard (Recommended)');
console.log('  1. Log into https://app.supabase.com');
console.log('  2. Select your project');
console.log('  3. Go to SQL Editor → New Query');
console.log('  4. Copy the SQL above and run it\n');

console.log('Option 2: Via apply-remote-schema.sh (requires credentials)');
console.log('  export ACCESS_TOKEN="your_supabase_access_token"');
console.log('  export DB_PASSWORD="your_db_password"');
console.log('  bash scripts/apply-remote-schema.sh\n');

console.log('Option 3: Via psql directly (if you have direct DB access)');
console.log('  psql $DATABASE_URL << EOF');
console.log(migrationSQL);
console.log('  EOF\n');

console.log('Option 4: Via Supabase CLI (if installed)');
console.log('  supabase db push --linked\n');

console.log('After applying the migration, run:');
console.log('  node scripts/migrate_assigned_role_to_position.mjs --dry-run\n');
