import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../../..");
dotenv.config({ path: path.join(rootDir, ".env") });
dotenv.config({ path: path.join(rootDir, ".env.local"), override: true });

type Role = "ceo" | "cfo" | "manager" | "worker";

type SeedUser = {
  email: string;
  full_name: string;
  role: Role;
  department: string | null;
  skills: string[];
  reports_to_email: string | null;
  position_title: string;
};

const ORG_NAME = process.env.SEED_ORG_NAME ?? "Nexus Tech Solutions";
const ORG_DOMAIN = process.env.SEED_ORG_DOMAIN ?? "nexustech.solutions";
const EMAIL_DOMAIN = process.env.SEED_USER_EMAIL_DOMAIN ?? "nexustech-e2e.org";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function email(local: string): string {
  return `${local}@${EMAIL_DOMAIN}`;
}

function makeUsers(): SeedUser[] {
  return [
    {
      email: email("ceo"),
      full_name: "Jordan Mercer",
      role: "ceo",
      department: null,
      skills: ["strategy", "enterprise sales", "delivery governance"],
      reports_to_email: null,
      position_title: "Chief Executive Officer"
    },
    {
      email: email("cfo"),
      full_name: "Sam Okonkwo",
      role: "cfo",
      department: "Finance",
      skills: ["rev rec", "SOC2 readiness", "forecasting"],
      reports_to_email: email("ceo"),
      position_title: "Chief Financial Officer"
    },
    {
      email: email("vp.engineering"),
      full_name: "Priya Nandakumar",
      role: "manager",
      department: "Engineering",
      skills: ["cloud architecture", "platform reliability", "people leadership"],
      reports_to_email: email("ceo"),
      position_title: "VP Engineering"
    },
    {
      email: email("vp.customer_success"),
      full_name: "Alex Rivera",
      role: "manager",
      department: "Customer Success",
      skills: ["enterprise onboarding", "expansion", "QBRs"],
      reports_to_email: email("ceo"),
      position_title: "VP Customer Success"
    },
    ...[1, 2, 3].map((n) => ({
      email: email(`engineer.${n}`),
      full_name: `Senior Solutions Engineer ${n}`,
      role: "worker" as const,
      department: "Engineering",
      skills: ["AWS", "Kubernetes", "Terraform", "customer workshops"],
      reports_to_email: email("vp.engineering"),
      position_title: "Senior Solutions Engineer"
    })),
    ...[1, 2, 3].map((n) => ({
      email: email(`csm.${n}`),
      full_name: `Customer Success Manager ${n}`,
      role: "worker" as const,
      department: "Customer Success",
      skills: ["health scoring", "adoption", "renewals"],
      reports_to_email: email("vp.customer_success"),
      position_title: "Customer Success Manager"
    }))
  ];
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
    throw new Error(`Unable to upsert org: ${orgUpsert.error?.message ?? "unknown"}`);
  }

  const orgId = orgUpsert.data.id as string;

  const branches = [
    { org_id: orgId, name: "Americas HQ", code: "NA", city: "Austin", country: "US", is_headquarters: true },
    { org_id: orgId, name: "EMEA", code: "EMEA", city: "Amsterdam", country: "NL", is_headquarters: false }
  ];

  const branchInsert = await supabase.from("org_branches").upsert(branches, { onConflict: "org_id,code" }).select("id,code");
  if (branchInsert.error || !branchInsert.data?.length) {
    throw new Error(`Unable to upsert org_branches: ${branchInsert.error?.message ?? "unknown"}`);
  }

  const branchIdByCode = new Map<string, string>();
  for (const row of branchInsert.data) {
    branchIdByCode.set(String(row.code), String(row.id));
  }
  const hqBranchId = branchIdByCode.get("NA");
  if (!hqBranchId) {
    throw new Error("Missing NA branch id");
  }

  const users = makeUsers();
  const uniquePositionTitles = [...new Set(users.map((u) => u.position_title))];

  const positionRows = uniquePositionTitles.map((title) => {
    const sample = users.find((u) => u.position_title === title)!;
    const isExec = sample.role === "ceo" || sample.role === "cfo";
    const level = sample.role === "ceo" || sample.role === "cfo" ? 0 : sample.role === "manager" ? 1 : 2;
    return {
      org_id: orgId,
      title,
      level,
      is_custom: false,
      confirmed: true,
      branch_id: hqBranchId,
      department: sample.department,
      power_level: isExec ? 100 : sample.role === "manager" ? 80 : 60,
      visibility_scope: isExec ? "org" : sample.role === "manager" ? "subtree" : "department",
      metadata: {
        seed: "tech_solutions_e2e",
        focus:
          title.includes("Engineer") || title.includes("Solutions")
            ? "cloud_migration_managed_soc"
            : title.includes("Success")
              ? "customer_adoption"
              : "leadership"
      }
    };
  });

  const posUpsert = await supabase.from("positions").upsert(positionRows, { onConflict: "org_id,title" }).select("id,title");
  if (posUpsert.error || !posUpsert.data) {
    throw new Error(`Unable to upsert positions: ${posUpsert.error?.message ?? "unknown"}`);
  }

  const positionIdByTitle = new Map<string, string>();
  for (const row of posUpsert.data) {
    positionIdByTitle.set(String(row.title), String(row.id));
  }

  const ceoPid = positionIdByTitle.get("Chief Executive Officer");
  if (!ceoPid) {
    throw new Error("CEO position missing");
  }

  const reportsMap: Record<string, string | null> = {
    "Chief Financial Officer": ceoPid,
    "VP Engineering": ceoPid,
    "VP Customer Success": ceoPid,
    "Senior Solutions Engineer": positionIdByTitle.get("VP Engineering") ?? null,
    "Customer Success Manager": positionIdByTitle.get("VP Customer Success") ?? null
  };

  for (const [title, reportsTo] of Object.entries(reportsMap)) {
    if (!reportsTo || title === "Chief Executive Officer") {
      continue;
    }
    const pid = positionIdByTitle.get(title);
    if (!pid) {
      continue;
    }
    const upd = await supabase.from("positions").update({ reports_to_position_id: reportsTo }).eq("id", pid);
    if (upd.error) {
      throw new Error(`Failed to link reports_to for ${title}: ${upd.error.message}`);
    }
  }

  const authIdByEmail = new Map<string, string>();
  const authList = await supabase.auth.admin.listUsers();
  if (authList.error) {
    throw new Error(`Unable to list auth users: ${authList.error.message}`);
  }
  for (const authUser of authList.data.users ?? []) {
    if (typeof authUser.email === "string" && authUser.id) {
      authIdByEmail.set(authUser.email, authUser.id);
    }
  }

  for (const user of users) {
    const existingAuthId = authIdByEmail.get(user.email);
    if (existingAuthId) {
      await supabase.auth.admin.updateUserById(existingAuthId, {
        email: user.email,
        user_metadata: { role: user.role }
      });
      continue;
    }

    const created = await supabase.auth.admin.createUser({
      email: user.email,
      password: user.email,
      email_confirm: true,
      user_metadata: { role: user.role }
    });

    if (created.error && !created.error.message?.toLowerCase().includes("already")) {
      throw new Error(`Unable to create auth user ${user.email}: ${created.error.message ?? "unknown"}`);
    }
    if (created.data.user?.id) {
      authIdByEmail.set(user.email, created.data.user.id);
    }
  }

  const baseUserRows = users.map((user) => {
    const authId = authIdByEmail.get(user.email) || randomUUID();
    const positionId = positionIdByTitle.get(user.position_title) ?? null;
    return {
      id: authId,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      department: user.department,
      skills: user.skills,
      status: "active" as const,
      org_id: orgId,
      email_verified: true,
      agent_enabled: true,
      position_id: positionId
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
    await supabase
      .from("users")
      .update({ reports_to: reportsTo, updated_at: new Date().toISOString() })
      .eq("id", userId);
  }

  const ceoId = emailToId.get(email("ceo"));
  const cfoId = emailToId.get(email("cfo"));
  if (!ceoId || !cfoId) {
    throw new Error("Unable to resolve executive IDs");
  }

  const orgOwner = await supabase.from("orgs").update({ created_by: ceoId }).eq("id", orgId);
  if (orgOwner.error) {
    throw new Error(`Unable to set org created_by: ${orgOwner.error.message}`);
  }

  const goalsPayload = [
    {
      created_by: ceoId,
      title: "FY26 platform reliability charter",
      description: "Deliver 99.95% uptime for managed SOC and cloud migration runbooks.",
      raw_input: "Board expects measurable reliability and incident transparency.",
      status: "active" as const,
      priority: "high" as const,
      kpi: "MTTR under 30m for P1",
      deadline: new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10),
      simulation: false
    },
    {
      created_by: cfoId,
      title: "SOC2 Type II evidence pipeline",
      description: "Automate evidence collection across identity, change management, and vendor risk.",
      raw_input: "Audit window Q3; align with Customer Trust team.",
      status: "active" as const,
      priority: "high" as const,
      kpi: "100% controls mapped",
      deadline: new Date(Date.now() + 120 * 86_400_000).toISOString().slice(0, 10),
      simulation: false
    },
    {
      created_by: ceoId,
      title: "Expand EMEA managed services",
      description: "Stand up Amsterdam delivery pod with two flagship accounts.",
      raw_input: "Leverage EMEA branch for local data residency wins.",
      status: "active" as const,
      priority: "medium" as const,
      kpi: "2 signed SOWs",
      deadline: new Date(Date.now() + 180 * 86_400_000).toISOString().slice(0, 10),
      simulation: false
    }
  ];

  const goalsInsert = await supabase.from("goals").insert(goalsPayload).select("id");
  if (goalsInsert.error) {
    throw new Error(`Unable to insert goals: ${goalsInsert.error.message}`);
  }

  const goalIds = (goalsInsert.data ?? []).map((row) => String(row.id));
  const workerIds = users.filter((u) => u.role === "worker").map((u) => emailToId.get(u.email)).filter(Boolean) as string[];
  const managerIds = users.filter((u) => u.role === "manager").map((u) => emailToId.get(u.email)).filter(Boolean) as string[];

  const tasksPayload = Array.from({ length: 24 }).map((_, index) => {
    const pool = [...managerIds, ...workerIds];
    const assigneeId = pool[index % pool.length]!;
    const role: Role = managerIds.includes(assigneeId) ? "manager" : "worker";
    return {
      goal_id: goalIds[index % goalIds.length]!,
      depth: role === "manager" ? 1 : 2,
      title: `E2E initiative task ${index + 1}`,
      description: `Delivery workstream for Nexus solutions portfolio (${index + 1}).`,
      success_criteria: `Milestone ${index + 1} signed off by stakeholder.`,
      assigned_to: assigneeId,
      assigned_role: role,
      status: index % 7 === 0 ? ("blocked" as const) : ("in_progress" as const),
      priority: index % 4 === 0 ? ("high" as const) : ("medium" as const),
      org_id: orgId,
      created_by: ceoId,
      routing_confirmed: true,
      sla_status: index % 9 === 0 ? ("at_risk" as const) : ("on_track" as const)
    };
  });

  const tasksInsert = await supabase.from("tasks").insert(tasksPayload);
  if (tasksInsert.error) {
    throw new Error(`Unable to insert tasks: ${tasksInsert.error.message}`);
  }

  console.log(`Tech E2E seed complete: ${ORG_NAME} (${orgId})`);
  console.log(`CEO login: ${email("ceo")} / password same as email`);
  console.log(`Branches: ${branchInsert.data.length}, Users: ${users.length}, Goals: ${goalIds.length}, Tasks: ${tasksPayload.length}`);
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
