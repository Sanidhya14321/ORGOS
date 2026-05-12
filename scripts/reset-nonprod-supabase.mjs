#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(rootDir, ".env") });
dotenv.config({ path: path.join(rootDir, ".env.local"), override: true });

const SCHEMA_PROBES = [
  { table: "orgs", columns: "id,name,domain" },
  { table: "users", columns: "id,email,org_id,status" },
  { table: "tasks", columns: "id,assigned_position_id,org_id" },
  { table: "goals", columns: "id,org_id,title" },
  { table: "positions", columns: "id,branch_id,power_level,visibility_scope" },
  { table: "org_branches", columns: "id,org_id,name,code" },
  { table: "position_assignments", columns: "id,org_id,position_id,assignment_status,activation_state" },
  { table: "position_credentials", columns: "id,invite_token,auth_user_id,issued_mode,activation_status" },
  { table: "org_documents", columns: "id,org_id,normalized_content,retrieval_mode,section_count" },
  { table: "org_document_sections", columns: "id,org_id,document_id,section_index" },
  { table: "goal_forecasts", columns: "id,org_id,goal_id,horizon_days" }
];

const TABLE_DELETE_FILTERS = {
  org_settings: "org_id",
  org_billing: "org_id"
};

const DELETION_ORDER = [
  "pipeline_events",
  "interviews",
  "referrals",
  "applicants",
  "jobs",
  "task_attachments",
  "task_comments",
  "routing_suggestions",
  "org_document_sections",
  "org_documents",
  "position_credentials",
  "position_assignments",
  "goal_forecasts",
  "time_logs",
  "analytics_snapshots",
  "meeting_ingestions",
  "custom_field_values",
  "custom_fields",
  "org_structure_suggestions",
  "workflow_definitions",
  "org_settings",
  "goal_templates",
  "rejection_templates",
  "push_subscriptions",
  "org_billing",
  "user_integrations",
  "integrations",
  "user_api_keys",
  "user_preferences",
  "sessions",
  "audit_log",
  "reports",
  "agent_logs",
  "tasks",
  "goals",
  "positions",
  "org_branches",
  "orgs",
  "users"
];

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function getProjectRef(supabaseUrl) {
  const match = supabaseUrl.match(/^https:\/\/([^.]+)\.supabase\.co$/);
  if (!match) {
    throw new Error(`Could not extract project ref from ${supabaseUrl}`);
  }
  return match[1];
}

async function verifySchemaMarkers(supabase) {
  for (const probe of SCHEMA_PROBES) {
    const result = await supabase.from(probe.table).select(probe.columns).limit(1);
    if (result.error) {
      throw new Error(`Schema probe failed for ${probe.table}: ${result.error.message}`);
    }
  }
}

async function deleteAllRows(supabase, table) {
  const deleteColumn = TABLE_DELETE_FILTERS[table] ?? "id";
  const result = await supabase.from(table).delete().not(deleteColumn, "is", null);
  if (result.error) {
    throw new Error(`Failed to delete rows from ${table}: ${result.error.message}`);
  }

  console.log(`- cleared ${table}`);
}

async function purgeAuthUsers(supabase) {
  let deletedCount = 0;

  while (true) {
    const page = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (page.error) {
      throw new Error(`Failed to list auth users: ${page.error.message}`);
    }

    const users = page.data.users ?? [];
    if (users.length === 0) {
      break;
    }

    for (const user of users) {
      const deletion = await supabase.auth.admin.deleteUser(user.id);
      if (deletion.error) {
        throw new Error(`Failed to delete auth user ${user.id}: ${deletion.error.message}`);
      }
      deletedCount += 1;
    }
  }

  console.log(`- deleted ${deletedCount} auth users`);
}

async function assertTableEmpty(supabase, table) {
  const result = await supabase.from(table).select("id", { count: "exact", head: true });
  if (result.error) {
    throw new Error(`Failed to verify row count for ${table}: ${result.error.message}`);
  }
  return result.count ?? 0;
}

async function main() {
  const supabaseUrl = requiredEnv("SUPABASE_URL");
  const supabaseKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });

  const projectRef = getProjectRef(supabaseUrl);
  console.log(`Resetting non-production Supabase project ${projectRef}`);

  await verifySchemaMarkers(supabase);
  console.log(`- schema markers verified across ${SCHEMA_PROBES.length} probes`);

  for (const table of DELETION_ORDER) {
    await deleteAllRows(supabase, table);
  }

  await purgeAuthUsers(supabase);

  const [orgCount, userCount] = await Promise.all([
    assertTableEmpty(supabase, "orgs"),
    assertTableEmpty(supabase, "users")
  ]);

  const authPage = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });
  if (authPage.error) {
    throw new Error(`Failed to verify auth users: ${authPage.error.message}`);
  }

  console.log(`- remaining org rows: ${orgCount}`);
  console.log(`- remaining user rows: ${userCount}`);
  console.log(`- remaining auth users: ${(authPage.data.users ?? []).length}`);

  if (orgCount !== 0 || userCount !== 0 || (authPage.data.users ?? []).length !== 0) {
    throw new Error("Non-production reset did not fully clear auth/users/orgs");
  }

  console.log("Non-production reset complete.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
