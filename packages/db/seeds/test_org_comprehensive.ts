import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

type Role = "ceo" | "cfo" | "manager" | "worker";

type SeedUser = {
  email: string;
  full_name: string;
  role: Role;
  department: string | null;
  skills: string[];
  reports_to_email: string | null;
};

const ORG_NAME = "ORGOS Test Org";
const ORG_DOMAIN = "test.orgos.ai";
const DEPARTMENTS = ["Engineering", "Product", "Sales", "Finance", "Operations", "Marketing", "HR"];

const repoRootEnvPath = fileURLToPath(new URL("../../../.env.local", import.meta.url));
loadEnv({ path: repoRootEnvPath });

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function makeUsers(): SeedUser[] {
  const users: SeedUser[] = [];

  // CEO
  users.push({
    email: "ceo@test.orgos.ai",
    full_name: "Alex Chen",
    role: "ceo",
    department: null,
    skills: ["strategy", "execution", "leadership", "vision"],
    reports_to_email: null
  });

  // CFO
  users.push({
    email: "cfo@test.orgos.ai",
    full_name: "Sofia Rodriguez",
    role: "cfo",
    department: "Finance",
    skills: ["budgeting", "forecasting", "risk", "compliance"],
    reports_to_email: "ceo@test.orgos.ai"
  });

  // Department Managers (7 departments)
  DEPARTMENTS.forEach((department, index) => {
    users.push({
      email: `manager.${department.toLowerCase()}@test.orgos.ai`,
      full_name: `${department} Manager ${String.fromCharCode(65 + index)}`,
      role: "manager",
      department,
      skills: [department.toLowerCase(), "planning", "mentoring", "coordination"],
      reports_to_email: "ceo@test.orgos.ai"
    });
  });

  // Workers - 150 workers distributed across departments
  const skillSets = ["design", "backend", "frontend", "devops", "testing", "writing", "analysis", "sales", "support"];
  let workerIndex = 0;
  while (users.length < 160) {
    const department = DEPARTMENTS[workerIndex % DEPARTMENTS.length];
    const skill1 = skillSets[workerIndex % skillSets.length];
    const skill2 = skillSets[(workerIndex + 1) % skillSets.length];
    users.push({
      email: `worker.${workerIndex + 1}@test.orgos.ai`,
      full_name: `Worker ${String.fromCharCode(65 + (workerIndex % 26))}${Math.floor(workerIndex / 26) + 1}`,
      role: "worker",
      department,
      skills: [department.toLowerCase(), skill1, skill2, "delivery"],
      reports_to_email: `manager.${department.toLowerCase()}@test.orgos.ai`
    });
    workerIndex += 1;
  }

  return users;
}

async function seed(): Promise<void> {
  const supabaseUrl = process.env.SUPABASE_URL ?? requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false }
  });

  console.log("🌱 Seeding ORGOS Test Org with 160 members...");

  // Create organization
  const orgUpsert = await supabase
    .from("orgs")
    .upsert({ name: ORG_NAME, domain: ORG_DOMAIN }, { onConflict: "name" })
    .select("id")
    .single();

  if (orgUpsert.error || !orgUpsert.data) {
    throw new Error(`Unable to upsert test org: ${orgUpsert.error?.message ?? "unknown error"}`);
  }

  const orgId = orgUpsert.data.id as string;
  console.log(`✅ Organization created: ${orgId}`);

  // Create positions
  const positionsPayload = [
    { org_id: orgId, title: "Chief Executive Officer", level: 0, confirmed: true },
    { org_id: orgId, title: "Chief Financial Officer", level: 0, confirmed: true },
    { org_id: orgId, title: "Department Manager", level: 1, confirmed: true },
    { org_id: orgId, title: "Individual Contributor", level: 2, confirmed: true }
  ];

  const positionInsert = await supabase.from("positions").upsert(positionsPayload, { onConflict: "org_id,title" });
  if (positionInsert.error) {
    throw new Error(`Unable to upsert positions: ${positionInsert.error.message}`);
  }
  console.log(`✅ Positions created`);

  const users = makeUsers();

  const authList = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (authList.error) {
    throw new Error(`Unable to list auth users: ${authList.error.message}`);
  }

  const authIdByEmail = new Map<string, string>();
  for (const authUser of authList.data.users ?? []) {
    if (typeof authUser.email === "string" && authUser.id) {
      authIdByEmail.set(authUser.email, authUser.id);
    }
  }

  let created = 0;
  let updated = 0;

  for (const user of users) {
    const existingAuthId = authIdByEmail.get(user.email);
    if (existingAuthId) {
      const updated_resp = await supabase.auth.admin.updateUserById(existingAuthId, {
        email: user.email,
        password: user.email,
        email_confirm: true,
        user_metadata: {
          role: user.role
        }
      });

      if (updated_resp.error) {
        throw new Error(`Unable to update auth user ${user.email}: ${updated_resp.error.message}`);
      }

      authIdByEmail.set(user.email, existingAuthId);
      updated++;
      continue;
    }

    const created_resp = await supabase.auth.admin.createUser({
      email: user.email,
      password: user.email,
      email_confirm: true,
      user_metadata: {
        role: user.role
      }
    });

    if (created_resp.error) {
      throw new Error(`Unable to create auth user ${user.email}: ${created_resp.error.message}`);
    }

    const authId = created_resp.data?.user?.id;
    if (!authId) {
      throw new Error(`Created user has no ID: ${user.email}`);
    }

    authIdByEmail.set(user.email, authId);
    created++;
  }

  console.log(`✅ Auth users: ${created} created, ${updated} updated`);

  // Now create user records in public.users table
  const userRecords: any[] = [];

  for (const user of users) {
    const authId = authIdByEmail.get(user.email);
    if (!authId) {
      throw new Error(`No auth ID for user: ${user.email}`);
    }

    const reportsToEmail = user.reports_to_email;
    let reportsToId = null;

    if (reportsToEmail) {
      const reportsToAuthId = authIdByEmail.get(reportsToEmail);
      if (!reportsToAuthId) {
        throw new Error(`No auth ID for reports_to user: ${reportsToEmail}`);
      }

      // First find the user ID in public.users for the reports_to user
      const reportsToUserQuery = await supabase
        .from("users")
        .select("id")
        .eq("email", reportsToEmail)
        .single();

      if (reportsToUserQuery.error && reportsToUserQuery.error.code !== "PGRST116") {
        throw new Error(`Error querying reports_to user: ${reportsToUserQuery.error.message}`);
      }

      if (reportsToUserQuery.data) {
        reportsToId = reportsToUserQuery.data.id;
      }
    }

    userRecords.push({
      id: authId,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      org_id: orgId,
      department: user.department,
      reports_to: reportsToId,
      status: "active",
      email_verified: true,
      skills: user.skills,
      current_load: 0
    });
  }

  // Insert users in batches
  const batchSize = 50;
  for (let i = 0; i < userRecords.length; i += batchSize) {
    const batch = userRecords.slice(i, i + batchSize);
    const insertResult = await supabase.from("users").upsert(batch, { onConflict: "id" });

    if (insertResult.error) {
      throw new Error(`Unable to upsert users batch: ${insertResult.error.message}`);
    }
  }

  console.log(`✅ User records created: ${userRecords.length}`);
  console.log(`\n🎉 Seed complete! Organization: ${ORG_NAME} (${orgId})`);
  console.log(`📊 Total users: ${users.length}`);
  console.log(`👤 CEO: ceo@test.orgos.ai`);
  console.log(`💰 CFO: cfo@test.orgos.ai`);
  console.log(`👥 Managers: ${DEPARTMENTS.length}`);
  console.log(`🔧 Workers: ${users.length - DEPARTMENTS.length - 2}`);
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
