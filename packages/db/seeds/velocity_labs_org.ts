import "dotenv/config";
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

const ORG_NAME = "ORGOS Velocity Labs";
const ORG_DOMAIN = "velocity-labs.orgos.ai";
const DEPARTMENTS = ["Engineering", "Product", "Sales", "Finance", "Operations"];

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function makeUsers(): SeedUser[] {
  const users: SeedUser[] = [];

  users.push({
    email: "ceo@velocity-labs.orgos.ai",
    full_name: "Jordan Vale",
    role: "ceo",
    department: null,
    skills: ["strategy", "execution", "leadership"],
    reports_to_email: null
  });

  users.push({
    email: "cfo@velocity-labs.orgos.ai",
    full_name: "Morgan Lee",
    role: "cfo",
    department: "Finance",
    skills: ["budgeting", "forecasting", "risk"],
    reports_to_email: "ceo@velocity-labs.orgos.ai"
  });

  DEPARTMENTS.forEach((department, index) => {
    users.push({
      email: `manager.${department.toLowerCase()}@velocity-labs.orgos.ai`,
      full_name: `${department} Manager ${index + 1}`,
      role: "manager",
      department,
      skills: [department.toLowerCase(), "planning", "mentoring"],
      reports_to_email: "ceo@velocity-labs.orgos.ai"
    });
  });

  let workerIndex = 0;
  while (users.length < 50) {
    const department = DEPARTMENTS[workerIndex % DEPARTMENTS.length];
    users.push({
      email: `worker.${workerIndex + 1}@velocity-labs.orgos.ai`,
      full_name: `Worker ${workerIndex + 1}`,
      role: "worker",
      department,
      skills: [department.toLowerCase(), "delivery", `skill-${(workerIndex % 7) + 1}`],
      reports_to_email: `manager.${department.toLowerCase()}@velocity-labs.orgos.ai`
    });
    workerIndex += 1;
  }

  return users;
}

async function seed(): Promise<void> {
  const supabaseUrl = requiredEnv("SUPABASE_URL");
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false }
  });

  const orgUpsert = await supabase
    .from("orgs")
    .upsert({ name: ORG_NAME, domain: ORG_DOMAIN }, { onConflict: "name" })
    .select("id")
    .single();

  if (orgUpsert.error || !orgUpsert.data) {
    throw new Error(`Unable to upsert velocity org: ${orgUpsert.error?.message ?? "unknown error"}`);
  }

  const orgId = orgUpsert.data.id as string;

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

  for (const user of users) {
    const existingAuthId = authIdByEmail.get(user.email);
    if (existingAuthId) {
      const updated = await supabase.auth.admin.updateUserById(existingAuthId, {
        email: user.email,
        password: user.email,
        email_confirm: true,
        user_metadata: {
          role: user.role
        }
      });

      if (updated.error) {
        throw new Error(`Unable to update auth user ${user.email}: ${updated.error.message}`);
      }

      authIdByEmail.set(user.email, existingAuthId);
      continue;
    }

    const created = await supabase.auth.admin.createUser({
      email: user.email,
      password: user.email,
      email_confirm: true,
      user_metadata: {
        role: user.role
      }
    });

    if (created.error || !created.data.user?.id) {
      throw new Error(`Unable to create auth user ${user.email}: ${created.error?.message ?? "unknown error"}`);
    }

    authIdByEmail.set(user.email, created.data.user.id);
  }

  const baseUserRows = users.map((user) => {
    const authId = authIdByEmail.get(user.email);
    if (!authId) {
      throw new Error(`Missing auth user id for ${user.email}`);
    }

    return {
      id: authId,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      department: user.department,
      skills: user.skills,
      status: "active",
      org_id: orgId,
      email_verified: true,
      agent_enabled: true
    };
  });

  const upsertUsers = await supabase.from("users").upsert(baseUserRows, { onConflict: "email" }).select("id,email");
  if (upsertUsers.error) {
    throw new Error(`Unable to upsert users: ${upsertUsers.error.message}`);
  }

  const emailToId = new Map<string, string>();
  for (const row of upsertUsers.data ?? []) {
    emailToId.set(String(row.email), String(row.id));
  }

  for (const user of users) {
    const userId = emailToId.get(user.email);
    if (!userId) {
      continue;
    }

    const reportsTo = user.reports_to_email ? emailToId.get(user.reports_to_email) ?? null : null;
    const updateResult = await supabase
      .from("users")
      .update({ reports_to: reportsTo, updated_at: new Date().toISOString() })
      .eq("id", userId);

    if (updateResult.error) {
      throw new Error(`Unable to update reporting line for ${user.email}: ${updateResult.error.message}`);
    }
  }

  const ceoId = emailToId.get("ceo@velocity-labs.orgos.ai");
  const cfoId = emailToId.get("cfo@velocity-labs.orgos.ai");
  if (!ceoId || !cfoId) {
    throw new Error("Unable to resolve executive IDs after upsert");
  }

  const goalsPayload = Array.from({ length: 12 }).map((_, index) => ({
    created_by: index % 2 === 0 ? ceoId : cfoId,
    title: `Velocity Goal ${index + 1}`,
    description: `Seeded velocity initiative ${index + 1}`,
    raw_input: `Deliver velocity initiative ${index + 1}`,
    status: "active",
    priority: index % 4 === 0 ? "high" : "medium",
    kpi: `VL-KPI-${index + 1}`,
    deadline: new Date(Date.now() + (index + 10) * 86_400_000).toISOString().slice(0, 10),
    simulation: false
  }));

  const goalsInsert = await supabase.from("goals").insert(goalsPayload).select("id");
  if (goalsInsert.error) {
    throw new Error(`Unable to insert seeded goals: ${goalsInsert.error.message}`);
  }

  const workerIds = users
    .filter((user) => user.role === "worker")
    .map((user) => emailToId.get(user.email))
    .filter((id): id is string => Boolean(id));

  const managerIds = users
    .filter((user) => user.role === "manager")
    .map((user) => emailToId.get(user.email))
    .filter((id): id is string => Boolean(id));

  const allAssignable = [...managerIds, ...workerIds];
  const goalIds = (goalsInsert.data ?? []).map((row) => String(row.id));

  const tasksPayload = Array.from({ length: 130 }).map((_, index) => {
    const assigneeId = allAssignable[index % allAssignable.length];
    const role: Role = managerIds.includes(assigneeId) ? "manager" : "worker";

    return {
      goal_id: goalIds[index % goalIds.length],
      depth: role === "manager" ? 1 : 2,
      title: `Velocity Task ${index + 1}`,
      description: `Seeded velocity task ${index + 1}`,
      success_criteria: `Complete velocity outcome ${index + 1}`,
      assigned_to: assigneeId,
      assigned_role: role,
      status: index % 12 === 0 ? "blocked" : "active",
      priority: index % 5 === 0 ? "high" : "medium",
      org_id: orgId,
      created_by: ceoId,
      routing_confirmed: true,
      sla_status: index % 19 === 0 ? "at_risk" : "on_track"
    };
  });

  const tasksInsert = await supabase.from("tasks").insert(tasksPayload);
  if (tasksInsert.error) {
    throw new Error(`Unable to insert seeded tasks: ${tasksInsert.error.message}`);
  }

  console.log(`Seed completed for ${ORG_NAME} (${orgId})`);
  console.log(`Users: ${users.length}, Goals: ${goalIds.length}, Tasks: ${tasksPayload.length}`);
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
