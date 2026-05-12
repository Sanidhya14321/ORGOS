import test from "node:test";
import assert from "node:assert/strict";
import orgRoutes from "../src/routes/org.js";
import goalsRoutes from "../src/routes/goals.js";
import tasksRoutes from "../src/routes/tasks.js";
import reportsRoutes from "../src/routes/reports.js";
import { buildRouteTestApp, createSupabaseMock, type QueryOperation } from "./helpers/mockBackend.js";

const orgId = "00000000-0000-0000-0000-000000000001";
const ceoId = "00000000-0000-0000-0000-000000000010";
const managerId = "00000000-0000-0000-0000-000000000011";
const otherManagerId = "00000000-0000-0000-0000-000000000012";
const workerId = "00000000-0000-0000-0000-000000000013";
const siblingWorkerId = "00000000-0000-0000-0000-000000000014";
const ceoPositionId = "10000000-0000-0000-0000-000000000010";
const managerPositionId = "10000000-0000-0000-0000-000000000011";
const otherManagerPositionId = "10000000-0000-0000-0000-000000000012";
const workerPositionId = "10000000-0000-0000-0000-000000000013";
const siblingWorkerPositionId = "10000000-0000-0000-0000-000000000014";
const goalTeamId = "20000000-0000-0000-0000-000000000001";
const goalOtherId = "20000000-0000-0000-0000-000000000002";
const taskTeamId = "30000000-0000-0000-0000-000000000001";
const taskOtherId = "30000000-0000-0000-0000-000000000002";

type UserRow = {
  id: string;
  org_id: string;
  role: "ceo" | "cfo" | "manager" | "worker";
  full_name: string;
  email: string;
  status: "active";
  department: string;
  position_id: string;
  reports_to: string | null;
  open_task_count: number;
  current_load: number;
};

type PositionRow = {
  id: string;
  org_id: string;
  title: string;
  level: number;
  department: string;
  branch_id: null;
  reports_to_position_id: string | null;
  power_level: number;
  visibility_scope: string;
  max_concurrent_tasks: number;
  is_custom: boolean;
  confirmed: boolean;
};

type GoalRow = {
  id: string;
  org_id: string;
  created_by: string;
  title: string;
  description: string | null;
  raw_input: string;
  status: "active";
  priority: "high" | "medium";
  kpi: string | null;
  deadline: string | null;
  simulation: boolean;
  created_at: string;
  updated_at: string;
};

type TaskRow = {
  id: string;
  org_id: string;
  goal_id: string;
  parent_id: string | null;
  depth: number;
  title: string;
  description: string | null;
  success_criteria: string;
  assigned_to: string | null;
  assigned_position_id: string | null;
  owner_id: string | null;
  assignees: string[];
  watchers: string[];
  assigned_role: "worker" | "manager";
  is_agent_task: boolean;
  status: "pending" | "in_progress" | "completed";
  deadline: string | null;
  created_at: string;
  report_id?: string | null;
};

function eqValue(operation: QueryOperation, column: string): unknown {
  return operation.filters.find((filter) => filter.kind === "eq" && filter.column === column)?.value;
}

function inValue(operation: QueryOperation, column: string): unknown[] {
  return (operation.filters.find((filter) => filter.kind === "in" && filter.column === column)?.value as unknown[]) ?? [];
}

function createFixture() {
  const users = new Map<string, UserRow>([
    [ceoId, { id: ceoId, org_id: orgId, role: "ceo", full_name: "Casey CEO", email: "ceo@orgos.test", status: "active", department: "Executive", position_id: ceoPositionId, reports_to: null, open_task_count: 0, current_load: 0 }],
    [managerId, { id: managerId, org_id: orgId, role: "manager", full_name: "Morgan Manager", email: "manager@orgos.test", status: "active", department: "Operations", position_id: managerPositionId, reports_to: ceoId, open_task_count: 1, current_load: 1 }],
    [otherManagerId, { id: otherManagerId, org_id: orgId, role: "manager", full_name: "Taylor Manager", email: "other-manager@orgos.test", status: "active", department: "Sales", position_id: otherManagerPositionId, reports_to: ceoId, open_task_count: 0, current_load: 0 }],
    [workerId, { id: workerId, org_id: orgId, role: "worker", full_name: "Wren Worker", email: "worker@orgos.test", status: "active", department: "Operations", position_id: workerPositionId, reports_to: managerId, open_task_count: 1, current_load: 1 }],
    [siblingWorkerId, { id: siblingWorkerId, org_id: orgId, role: "worker", full_name: "Sid Sibling", email: "sibling@orgos.test", status: "active", department: "Sales", position_id: siblingWorkerPositionId, reports_to: otherManagerId, open_task_count: 1, current_load: 1 }]
  ]);

  const positions = new Map<string, PositionRow>([
    [ceoPositionId, { id: ceoPositionId, org_id: orgId, title: "Chief Executive Officer", level: 0, department: "Executive", branch_id: null, reports_to_position_id: null, power_level: 100, visibility_scope: "org", max_concurrent_tasks: 3, is_custom: false, confirmed: true }],
    [managerPositionId, { id: managerPositionId, org_id: orgId, title: "Operations Manager", level: 1, department: "Operations", branch_id: null, reports_to_position_id: ceoPositionId, power_level: 70, visibility_scope: "subtree", max_concurrent_tasks: 2, is_custom: false, confirmed: true }],
    [otherManagerPositionId, { id: otherManagerPositionId, org_id: orgId, title: "Sales Manager", level: 1, department: "Sales", branch_id: null, reports_to_position_id: ceoPositionId, power_level: 70, visibility_scope: "subtree", max_concurrent_tasks: 2, is_custom: false, confirmed: true }],
    [workerPositionId, { id: workerPositionId, org_id: orgId, title: "Operations Specialist", level: 2, department: "Operations", branch_id: null, reports_to_position_id: managerPositionId, power_level: 40, visibility_scope: "self", max_concurrent_tasks: 2, is_custom: false, confirmed: true }],
    [siblingWorkerPositionId, { id: siblingWorkerPositionId, org_id: orgId, title: "Sales Specialist", level: 2, department: "Sales", branch_id: null, reports_to_position_id: otherManagerPositionId, power_level: 40, visibility_scope: "self", max_concurrent_tasks: 1, is_custom: false, confirmed: true }]
  ]);

  const goals = new Map<string, GoalRow>([
    [goalTeamId, { id: goalTeamId, org_id: orgId, created_by: ceoId, title: "Improve operations throughput", description: "Raise productivity", raw_input: "Improve operations throughput", status: "active", priority: "high", kpi: null, deadline: null, simulation: false, created_at: "2026-05-12T00:00:00.000Z", updated_at: "2026-05-12T00:00:00.000Z" }],
    [goalOtherId, { id: goalOtherId, org_id: orgId, created_by: ceoId, title: "Close enterprise sales", description: "Expand pipeline", raw_input: "Close enterprise sales", status: "active", priority: "medium", kpi: null, deadline: null, simulation: false, created_at: "2026-05-12T00:00:00.000Z", updated_at: "2026-05-12T00:00:00.000Z" }]
  ]);

  const tasks = new Map<string, TaskRow>([
    [taskTeamId, { id: taskTeamId, org_id: orgId, goal_id: goalTeamId, parent_id: null, depth: 0, title: "Run operations improvement", description: "Own operations workstream", success_criteria: "Operations target met", assigned_to: workerId, assigned_position_id: workerPositionId, owner_id: managerId, assignees: [workerId], watchers: [managerId], assigned_role: "worker", is_agent_task: false, status: "pending", deadline: null, created_at: "2026-05-12T00:00:00.000Z", report_id: null }],
    [taskOtherId, { id: taskOtherId, org_id: orgId, goal_id: goalOtherId, parent_id: null, depth: 0, title: "Run sales campaign", description: "Own sales workstream", success_criteria: "Sales target met", assigned_to: siblingWorkerId, assigned_position_id: siblingWorkerPositionId, owner_id: otherManagerId, assignees: [siblingWorkerId], watchers: [otherManagerId], assigned_role: "worker", is_agent_task: false, status: "pending", deadline: null, created_at: "2026-05-12T00:00:00.000Z", report_id: null }]
  ]);

  const routingSuggestions: unknown[] = [];

  const resolver = async (operation: QueryOperation) => {
    if (operation.table === "users" && operation.action === "select") {
      if (operation.select === "org_id") {
        return { data: users.get(String(eqValue(operation, "id"))) ?? null };
      }

      if (operation.select === "id, org_id, role, position_id, reports_to") {
        const userId = eqValue(operation, "id");
        if (typeof userId === "string") {
          return { data: users.get(userId) ?? null };
        }
        return { data: Array.from(users.values()).filter((user) => user.org_id === eqValue(operation, "org_id")) };
      }

      if (operation.select === "id, org_id, role, position_id") {
        return { data: users.get(String(eqValue(operation, "id"))) ?? null };
      }

      if (operation.select === "id, full_name, email, status, department, position_id, open_task_count") {
        return { data: Array.from(users.values()).filter((user) => user.org_id === eqValue(operation, "org_id")) };
      }

      if (operation.select === "id, full_name, position_id") {
        const ids = new Set(inValue(operation, "id").map(String));
        return { data: Array.from(users.values()).filter((user) => ids.has(user.id)) };
      }

      if (operation.select === "id, full_name, position_id, role") {
        const ids = new Set(inValue(operation, "id").map(String));
        return { data: Array.from(users.values()).filter((user) => ids.has(user.id)) };
      }

      if (operation.select === "id, full_name, department, role") {
        return { data: Array.from(users.values()).filter((user) => user.org_id === eqValue(operation, "org_id")) };
      }
    }

    if (operation.table === "users" && operation.action === "update") {
      const userId = String(eqValue(operation, "id"));
      const user = users.get(userId);
      if (user) {
        users.set(userId, { ...user, ...(operation.values as Partial<UserRow>) });
      }
      return { data: null };
    }

    if (operation.table === "positions" && operation.action === "select") {
      if (operation.select === "id, reports_to_position_id") {
        return { data: Array.from(positions.values()).filter((position) => position.org_id === eqValue(operation, "org_id")) };
      }

      if (operation.select === "id, title, level, department, branch_id, reports_to_position_id, power_level, visibility_scope, max_concurrent_tasks, is_custom, confirmed") {
        return { data: Array.from(positions.values()).filter((position) => position.org_id === eqValue(operation, "org_id")) };
      }

      if (operation.select === "id, title, level") {
        const ids = new Set(inValue(operation, "id").map(String));
        return { data: Array.from(positions.values()).filter((position) => ids.has(position.id)) };
      }
    }

    if (operation.table === "position_assignments" && operation.action === "select") {
      return { data: [] };
    }

    if (operation.table === "org_branches" && operation.action === "select") {
      return { data: [] };
    }

    if (operation.table === "goals" && operation.action === "select") {
      const goalId = eqValue(operation, "id");
      if (typeof goalId === "string") {
        return { data: goals.get(goalId) ?? null };
      }
      return { data: Array.from(goals.values()).filter((goal) => goal.org_id === eqValue(operation, "org_id")) };
    }

    if (operation.table === "tasks" && operation.action === "select") {
      if (operation.select === "*") {
        const taskId = eqValue(operation, "id");
        if (typeof taskId === "string") {
          return { data: tasks.get(taskId) ?? null };
        }

        let rows = Array.from(tasks.values()).filter((task) => task.org_id === eqValue(operation, "org_id"));
        const goalId = eqValue(operation, "goal_id");
        if (typeof goalId === "string") {
          rows = rows.filter((task) => task.goal_id === goalId);
        }
        const status = eqValue(operation, "status");
        if (typeof status === "string") {
          rows = rows.filter((task) => task.status === status);
        }
        return { data: rows };
      }

      if (operation.select === "goal_id, org_id, assigned_to, assigned_position_id, owner_id, assignees, watchers") {
        const goalIds = new Set(inValue(operation, "goal_id").map(String));
        return { data: Array.from(tasks.values()).filter((task) => goalIds.has(task.goal_id)) };
      }

      if (operation.select === "assigned_to, status") {
        const assigneeIds = new Set(inValue(operation, "assigned_to").map(String));
        const statuses = new Set(inValue(operation, "status").map(String));
        return {
          data: Array.from(tasks.values()).filter((task) =>
            task.assigned_to && assigneeIds.has(task.assigned_to) && statuses.has(task.status)
          )
        };
      }

      return { data: tasks.get(String(eqValue(operation, "id"))) ?? null };
    }

    if (operation.table === "tasks" && operation.action === "update") {
      const taskId = String(eqValue(operation, "id"));
      const task = tasks.get(taskId);
      if (!task) {
        return { data: null };
      }

      const updated = { ...task, ...(operation.values as Partial<TaskRow>) };
      tasks.set(taskId, updated);
      return { data: updated };
    }

    if (operation.table === "reports" && operation.action === "insert") {
      const taskId = String((operation.values as { task_id: string }).task_id);
      const task = tasks.get(taskId);
      if (task) {
        tasks.set(taskId, { ...task, report_id: String((operation.values as { id: string }).id) });
      }
      return { data: null };
    }

    if (operation.table === "routing_suggestions" && operation.action === "insert") {
      routingSuggestions.push(operation.values);
      return { data: null };
    }

    return { data: null };
  };

  return { users, tasks, routingSuggestions, resolver };
}

test("org tree visibility follows hierarchy scope", async () => {
  const ceoSupabase = createSupabaseMock({ resolve: createFixture().resolver });
  const ceoApp = await buildRouteTestApp({
    routes: orgRoutes,
    supabaseService: ceoSupabase.client,
    currentUser: { id: ceoId, role: "ceo" }
  });

  const ceoResponse = await ceoApp.inject({ method: "GET", url: `/orgs/${orgId}/tree` });
  assert.equal(ceoResponse.statusCode, 200);
  assert.deepEqual(
    ceoResponse.json().nodes.map((node: { id: string }) => node.id).sort(),
    [ceoPositionId, managerPositionId, otherManagerPositionId, workerPositionId, siblingWorkerPositionId].sort()
  );
  await ceoApp.close();

  const managerSupabase = createSupabaseMock({ resolve: createFixture().resolver });
  const managerApp = await buildRouteTestApp({
    routes: orgRoutes,
    supabaseService: managerSupabase.client,
    currentUser: { id: managerId, role: "manager" }
  });

  const managerResponse = await managerApp.inject({ method: "GET", url: `/orgs/${orgId}/tree` });
  assert.equal(managerResponse.statusCode, 200);
  assert.deepEqual(
    managerResponse.json().nodes.map((node: { id: string }) => node.id).sort(),
    [managerPositionId, workerPositionId].sort()
  );
  await managerApp.close();

  const workerSupabase = createSupabaseMock({ resolve: createFixture().resolver });
  const workerApp = await buildRouteTestApp({
    routes: orgRoutes,
    supabaseService: workerSupabase.client,
    currentUser: { id: workerId, role: "worker" }
  });

  const workerResponse = await workerApp.inject({ method: "GET", url: `/orgs/${orgId}/tree` });
  assert.equal(workerResponse.statusCode, 200);
  assert.deepEqual(workerResponse.json().nodes.map((node: { id: string }) => node.id), [workerPositionId]);
  await workerApp.close();
});

test("manager goal, task, and report access is limited to subtree work", async () => {
  const fixture = createFixture();
  const supabase = createSupabaseMock({ resolve: fixture.resolver });
  const app = await buildRouteTestApp({
    routes: [goalsRoutes, tasksRoutes, reportsRoutes],
    supabaseService: supabase.client,
    currentUser: { id: managerId, role: "manager" }
  });

  const goalsResponse = await app.inject({ method: "GET", url: "/goals" });
  assert.equal(goalsResponse.statusCode, 200);
  assert.deepEqual(goalsResponse.json().items.map((goal: { id: string }) => goal.id), [goalTeamId]);

  const tasksResponse = await app.inject({ method: "GET", url: "/tasks" });
  assert.equal(tasksResponse.statusCode, 200);
  assert.deepEqual(tasksResponse.json().items.map((task: { id: string }) => task.id), [taskTeamId]);

  const forbiddenReport = await app.inject({
    method: "POST",
    url: "/reports",
    payload: {
      task_id: taskOtherId,
      is_agent: false,
      status: "partial",
      insight: "Outside subtree",
      data: {},
      confidence: 0.5,
      sources: [],
      escalate: false
    }
  });
  assert.equal(forbiddenReport.statusCode, 403);
  await app.close();

  const reportFixture = createFixture();
  const reportTask = reportFixture.tasks.get(taskTeamId);
  if (reportTask) {
    reportFixture.tasks.set(taskTeamId, { ...reportTask, org_id: "" });
  }
  const reportApp = await buildRouteTestApp({
    routes: reportsRoutes,
    supabaseService: createSupabaseMock({ resolve: reportFixture.resolver }).client,
    currentUser: { id: managerId, role: "manager" }
  });

  const allowedReport = await reportApp.inject({
    method: "POST",
    url: "/reports",
    payload: {
      task_id: taskTeamId,
      is_agent: false,
      status: "completed",
      insight: "Completed inside subtree",
      data: { done: true },
      confidence: 0.9,
      sources: [],
      escalate: false
    }
  });
  assert.equal(allowedReport.statusCode, 201);
  await reportApp.close();
});

test("manager delegation stays inside subtree and routing confirmation persists assignee", async () => {
  const managerSupabase = createSupabaseMock({ resolve: createFixture().resolver });
  const managerApp = await buildRouteTestApp({
    routes: tasksRoutes,
    supabaseService: managerSupabase.client,
    currentUser: { id: managerId, role: "manager" }
  });

  const forbiddenDelegate = await managerApp.inject({
    method: "POST",
    url: `/tasks/${taskTeamId}/delegate`,
    payload: { assignTo: siblingWorkerId }
  });
  assert.equal(forbiddenDelegate.statusCode, 403);

  const allowedDelegate = await managerApp.inject({
    method: "POST",
    url: `/tasks/${taskTeamId}/delegate`,
    payload: { assignTo: workerId }
  });
  assert.equal(allowedDelegate.statusCode, 200);
  assert.equal(allowedDelegate.json().assigned_to, workerId);
  assert.equal(allowedDelegate.json().assigned_position_id, workerPositionId);
  await managerApp.close();

  const executiveSupabase = createSupabaseMock({ resolve: createFixture().resolver });
  const executiveApp = await buildRouteTestApp({
    routes: tasksRoutes,
    supabaseService: executiveSupabase.client,
    currentUser: { id: ceoId, role: "ceo" }
  });

  const routingResponse = await executiveApp.inject({
    method: "POST",
    url: `/tasks/${taskOtherId}/routing-confirm`,
    payload: {
      confirmed: [{ assigneeId: workerId, reason: "Better fit", confidence: 0.92 }],
      status: "pending"
    }
  });
  assert.equal(routingResponse.statusCode, 200);

  const routingUpdate = executiveSupabase.operations.find((operation) =>
    operation.table === "tasks" &&
    operation.action === "update" &&
    operation.filters.some((filter) => filter.kind === "eq" && filter.column === "id" && filter.value === taskOtherId)
  );
  assert.ok(routingUpdate);
  assert.equal((routingUpdate?.values as { assigned_to: string }).assigned_to, workerId);
  assert.equal((routingUpdate?.values as { assigned_position_id: string }).assigned_position_id, workerPositionId);
  assert.deepEqual((routingUpdate?.values as { assignees: string[] }).assignees, [workerId]);
  await executiveApp.close();
});
