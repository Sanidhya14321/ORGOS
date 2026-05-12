import test from "node:test";
import assert from "node:assert/strict";
import type { Task } from "@orgos/shared-types";
import { processManagerDecomposeJob } from "../src/queue/workers/decompose.manager.worker.js";
import { createSupabaseMock, type QueryOperation } from "./helpers/mockBackend.js";

const goalId = "00000000-0000-0000-0000-000000000999";
const orgId = "00000000-0000-0000-0000-000000000998";
const goalCreatorId = "00000000-0000-0000-0000-000000000997";
const userA = "00000000-0000-0000-0000-000000000010";
const userB = "00000000-0000-0000-0000-000000000011";

function buildTask(overrides: Partial<Task> = {}): Task {
  return {
    id: overrides.id ?? "00000000-0000-0000-0000-000000000100",
    goal_id: goalId,
    parent_id: null,
    depth: 0,
    title: overrides.title ?? "Generated task",
    success_criteria: overrides.success_criteria ?? "Finish the work",
    assigned_role: overrides.assigned_role ?? "worker",
    assigned_to: overrides.assigned_to ?? null,
    is_agent_task: overrides.is_agent_task ?? false,
    status: overrides.status ?? "pending",
    ...overrides
  };
}

test("manager decomposition increments workload only after successful inserts", async () => {
  const supabase = createSupabaseMock({
    resolve: async (operation: QueryOperation) => {
      if (operation.table === "tasks" && operation.action === "select" && operation.select === "*") {
        return { data: [] };
      }

      if (operation.table === "goals" && operation.action === "select") {
        return { data: { id: goalId, org_id: orgId, created_by: goalCreatorId } };
      }

      if (operation.table === "tasks" && operation.action === "insert") {
        return {
          data: {
            id: (operation.values as { id: string }).id
          }
        };
      }

      if (operation.table === "tasks" && operation.action === "select" && operation.select === "assigned_to, status") {
        return {
          data: [
            { assigned_to: userA, status: "pending" },
            { assigned_to: userA, status: "pending" }
          ]
        };
      }

      if (operation.table === "users" && operation.action === "update") {
        return { data: null };
      }

      return { data: null };
    }
  });

  const acknowledged: string[] = [];
  const emittedAssignments: Array<{ assigneeId: string; payload: unknown }> = [];

  await processManagerDecomposeJob(
    {
      data: {
        mode: "decompose",
        goalId,
        directive: "Ship the milestone",
        department: "engineering",
        deadline: "2026-06-01T00:00:00.000Z"
      }
    } as never,
    {
      supabase: supabase.client as never,
      managerAgentFn: async () => [
        buildTask({
          id: "00000000-0000-0000-0000-000000000101",
          title: "Task A"
        }),
        buildTask({
          id: "00000000-0000-0000-0000-000000000102",
          title: "Task B"
        })
      ],
      assignTaskFn: async (task) =>
        ({
          ...task,
          assigned_to: userA,
          assigned_role: "worker",
          is_agent_task: false
        }) as Task,
      enqueueIndividualAck: async (taskId) => {
        acknowledged.push(taskId);
      },
      emitTaskAssignedFn: (assigneeId, payload) => {
        emittedAssignments.push({ assigneeId, payload });
      }
    }
  );

  const taskInserts = supabase.operations.filter((operation) => operation.table === "tasks" && operation.action === "insert");
  assert.equal(taskInserts.length, 2);
  assert.equal((taskInserts[0]?.values as { org_id: string }).org_id, orgId);
  assert.equal((taskInserts[0]?.values as { created_by: string }).created_by, goalCreatorId);
  assert.equal((taskInserts[0]?.values as { owner_id: string }).owner_id, goalCreatorId);

  const workloadUpdate = supabase.operations.find(
    (operation) => operation.table === "users" && operation.action === "update"
  );
  assert.ok(workloadUpdate);
  assert.equal((workloadUpdate.values as { open_task_count: number }).open_task_count, 2);
  assert.equal((workloadUpdate.values as { current_load: number }).current_load, 2);

  assert.deepEqual(acknowledged, [
    "00000000-0000-0000-0000-000000000101",
    "00000000-0000-0000-0000-000000000102"
  ]);
  assert.equal(emittedAssignments.length, 2);
  assert.ok(supabase.operations.findIndex((operation) => operation.table === "users" && operation.action === "update") >
    supabase.operations.findIndex((operation) => operation.table === "tasks" && operation.action === "insert"));
});

test("manager decomposition rolls back inserted tasks if workload update fails", async () => {
  let userUpdateCount = 0;
  let workloadPass = 0;

  const supabase = createSupabaseMock({
    resolve: async (operation: QueryOperation) => {
      if (operation.table === "tasks" && operation.action === "select" && operation.select === "*") {
        return { data: [] };
      }

      if (operation.table === "goals" && operation.action === "select") {
        return { data: { id: goalId, org_id: orgId, created_by: goalCreatorId } };
      }

      if (operation.table === "tasks" && operation.action === "insert") {
        return {
          data: {
            id: (operation.values as { id: string }).id
          }
        };
      }

      if (operation.table === "tasks" && operation.action === "select" && operation.select === "assigned_to, status") {
        workloadPass += 1;
        return {
          data: workloadPass === 1
            ? [
                { assigned_to: userA, status: "pending" },
                { assigned_to: userB, status: "pending" }
              ]
            : []
        };
      }

      if (operation.table === "users" && operation.action === "update") {
        userUpdateCount += 1;
        if (userUpdateCount === 2) {
          return {
            error: {
              message: "simulated workload update failure"
            }
          };
        }

        return { data: null };
      }

      if (operation.table === "tasks" && operation.action === "delete") {
        return { data: null };
      }

      return { data: null };
    }
  });

  const acknowledged: string[] = [];
  const emittedAssignments: string[] = [];

  await assert.rejects(
    () =>
      processManagerDecomposeJob(
        {
          data: {
            mode: "decompose",
            goalId,
            directive: "Ship the milestone",
            department: "engineering",
            deadline: "2026-06-01T00:00:00.000Z"
          }
        } as never,
        {
          supabase: supabase.client as never,
          managerAgentFn: async () => [
            buildTask({
              id: "00000000-0000-0000-0000-000000000201",
              title: "Task A"
            }),
            buildTask({
              id: "00000000-0000-0000-0000-000000000202",
              title: "Task B"
            })
          ],
          assignTaskFn: async (task) =>
            ({
              ...task,
              assigned_to: task.id === "00000000-0000-0000-0000-000000000201" ? userA : userB,
              assigned_role: "worker",
              is_agent_task: false
            }) as Task,
          enqueueIndividualAck: async (taskId) => {
            acknowledged.push(taskId);
          },
          emitTaskAssignedFn: (assigneeId) => {
            emittedAssignments.push(assigneeId);
          }
        }
      ),
    /simulated workload update failure/
  );

  const deleteOperation = supabase.operations.find(
    (operation) => operation.table === "tasks" && operation.action === "delete"
  );
  assert.ok(deleteOperation);
  assert.equal(acknowledged.length, 0);
  assert.equal(emittedAssignments.length, 0);

  const rollbackUpdate = supabase.operations.filter(
    (operation) => operation.table === "users" && operation.action === "update"
  );
  assert.equal(rollbackUpdate.length, 4);
  assert.equal((rollbackUpdate[2]?.values as { open_task_count: number }).open_task_count, 0);
  assert.equal((rollbackUpdate[3]?.values as { open_task_count: number }).open_task_count, 0);
});

test("manager decomposition hands agent-owned tasks to the execute queue", async () => {
  const supabase = createSupabaseMock({
    resolve: async (operation: QueryOperation) => {
      if (operation.table === "tasks" && operation.action === "select" && operation.select === "*") {
        return { data: [] };
      }

      if (operation.table === "goals" && operation.action === "select") {
        return { data: { id: goalId, org_id: orgId, created_by: goalCreatorId } };
      }

      if (operation.table === "tasks" && operation.action === "insert") {
        return {
          data: {
            id: (operation.values as { id: string }).id
          }
        };
      }

      if (operation.table === "tasks" && operation.action === "select" && operation.select === "assigned_to, status") {
        return { data: [] };
      }

      if (operation.table === "users" && operation.action === "update") {
        return { data: null };
      }

      return { data: null };
    }
  });

  const executeQueued: string[] = [];
  const acknowledged: string[] = [];

  await processManagerDecomposeJob(
    {
      data: {
        mode: "decompose",
        goalId,
        directive: "Run the autonomous task",
        department: "ops",
        deadline: "2026-06-01T00:00:00.000Z"
      }
    } as never,
    {
      supabase: supabase.client as never,
      managerAgentFn: async () => [
        buildTask({
          id: "00000000-0000-0000-0000-000000000301",
          title: "Agent Task"
        })
      ],
      assignTaskFn: async (task) =>
        ({
          ...task,
          assigned_to: null,
          assigned_role: "worker",
          is_agent_task: true
        }) as Task,
      enqueueIndividualAck: async (taskId) => {
        acknowledged.push(taskId);
      },
      enqueueExecute: async (taskId) => {
        executeQueued.push(taskId);
      }
    }
  );

  assert.deepEqual(executeQueued, ["00000000-0000-0000-0000-000000000301"]);
  assert.deepEqual(acknowledged, []);
});
