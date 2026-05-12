import test from "node:test";
import assert from "node:assert/strict";
import type { Task } from "@orgos/shared-types";
import { selectAssignmentCandidate } from "../src/services/assignmentEngine.js";

function buildTask(overrides: Partial<Task> = {}): Task {
  return {
    id: overrides.id ?? "40000000-0000-0000-0000-000000000001",
    goal_id: overrides.goal_id ?? "40000000-0000-0000-0000-000000000010",
    parent_id: null,
    depth: 0,
    title: overrides.title ?? "Task",
    success_criteria: overrides.success_criteria ?? "Done",
    assigned_role: overrides.assigned_role ?? "worker",
    assigned_to: overrides.assigned_to ?? null,
    is_agent_task: overrides.is_agent_task ?? false,
    status: overrides.status ?? "pending",
    ...overrides
  };
}

test("assignment selection prefers exact position matches", () => {
  const selected = selectAssignmentCandidate({
    candidates: [
      { id: "user-a", position_id: "pos-a", open_task_count: 0, skills: ["ops"], role: "worker" },
      { id: "user-b", position_id: "pos-b", open_task_count: 3, skills: ["ops"], role: "worker" }
    ],
    task: buildTask({
      assigned_role: "worker",
      assigned_position_id: "pos-b",
      required_skills: ["ops"]
    })
  });

  assert.equal(selected?.id, "user-b");
});

test("assignment selection skips candidates at position capacity", () => {
  const selected = selectAssignmentCandidate({
    candidates: [
      { id: "user-a", position_id: "pos-a", open_task_count: 2, skills: ["ops"], role: "worker" },
      { id: "user-b", position_id: "pos-b", open_task_count: 1, skills: ["ops"], role: "worker" }
    ],
    task: buildTask({
      assigned_role: "worker",
      required_skills: ["ops"]
    }),
    positionCapacityById: new Map([
      ["pos-a", 2],
      ["pos-b", 3]
    ])
  });

  assert.equal(selected?.id, "user-b");
});
