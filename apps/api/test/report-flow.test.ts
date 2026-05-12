import test from "node:test";
import assert from "node:assert/strict";
import reportsRoutes from "../src/routes/reports.js";
import { buildRouteTestApp, createSupabaseMock, type QueryOperation } from "./helpers/mockBackend.js";

const userId = "00000000-0000-0000-0000-000000000111";
const taskId = "00000000-0000-0000-0000-000000000222";
const goalId = "00000000-0000-0000-0000-000000000333";

function createReportResolver() {
  return (operation: QueryOperation) => {
    if (operation.table === "tasks" && operation.action === "select" && operation.select === "id, assigned_to") {
      return { data: { id: taskId, assigned_to: userId } };
    }

    if (
      operation.table === "tasks" &&
      operation.action === "select" &&
      operation.select === "id, org_id, goal_id, parent_id, status, report_id"
    ) {
      return {
        data: {
          id: taskId,
          org_id: null,
          goal_id: goalId,
          parent_id: null,
          status: "in_progress",
          report_id: null
        }
      };
    }

    if (operation.table === "reports" && operation.action === "insert") {
      return { data: null };
    }

    if (operation.table === "tasks" && operation.action === "update") {
      return { data: null };
    }

    if (operation.table === "reports" && operation.action === "delete") {
      return { data: null };
    }

    if (operation.table === "tasks" && operation.action === "select" && operation.select === "id, parent_id") {
      return { data: { id: taskId, parent_id: null } };
    }

    if (operation.table === "tasks" && operation.action === "select" && operation.select === "status") {
      return { data: [] };
    }

    if (operation.table === "tasks" && operation.action === "select" && operation.select === "id, status") {
      return { data: [{ id: taskId, status: "completed" }] };
    }

    if (operation.table === "goals" && operation.action === "update") {
      return { data: null };
    }

    return { data: null };
  };
}

async function buildReportsApp() {
  const supabase = createSupabaseMock({
    resolve: createReportResolver()
  });

  const app = await buildRouteTestApp({
    routes: reportsRoutes,
    supabaseService: supabase.client,
    currentUser: {
      id: userId,
      role: "worker",
      email: "worker@orgos.test"
    }
  });

  return { app, operations: supabase.operations };
}

test("partial reports keep tasks in progress and do not zero counters", async () => {
  const { app, operations } = await buildReportsApp();

  const response = await app.inject({
    method: "POST",
    url: "/reports",
    payload: {
      task_id: taskId,
      is_agent: false,
      status: "partial",
      insight: "Progress update with enough detail.",
      data: { completed: 2, remaining: 3 },
      confidence: 0.74,
      sources: [],
      escalate: false
    }
  });

  assert.equal(response.statusCode, 201);
  assert.equal(response.json().taskStatus, "in_progress");

  const taskUpdate = operations.find((operation) => operation.table === "tasks" && operation.action === "update");
  assert.ok(taskUpdate);
  assert.equal((taskUpdate.values as { status: string }).status, "in_progress");

  const userCounterReset = operations.find((operation) => operation.table === "users" && operation.action === "update");
  assert.equal(userCounterReset, undefined);

  await app.close();
});

test("completed reports move tasks to completed", async () => {
  const { app, operations } = await buildReportsApp();

  const response = await app.inject({
    method: "POST",
    url: "/reports",
    payload: {
      task_id: taskId,
      is_agent: false,
      status: "completed",
      insight: "Task is fully finished with final evidence attached.",
      data: { delivered: true },
      confidence: 0.96,
      sources: [],
      escalate: false
    }
  });

  assert.equal(response.statusCode, 201);
  assert.equal(response.json().taskStatus, "completed");

  const taskUpdate = operations.find((operation) => operation.table === "tasks" && operation.action === "update");
  assert.ok(taskUpdate);
  assert.equal((taskUpdate.values as { status: string }).status, "completed");

  await app.close();
});
