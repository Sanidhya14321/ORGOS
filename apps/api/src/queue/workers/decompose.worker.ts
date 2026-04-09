import { Worker, type Job } from "bullmq";
import { ceoAgent, managerAgent, type GoalStructure } from "@orgos/agent-core";
import type { Task } from "@orgos/shared-types";
import { createSupabaseServiceClient } from "../../lib/clients.js";
import { readEnv } from "../../config/env.js";
import { assignTask } from "../../services/assignmentEngine.js";
import { emitGoalDecomposed } from "../../services/notifier.js";
import { getDecomposeQueue, getRedisConnection } from "../index.js";

interface DecomposeJobData {
  goalId: string;
}

async function insertTasksWithRollback(goalId: string, tasks: Task[]): Promise<void> {
  const env = readEnv();
  const supabase = createSupabaseServiceClient(env);
  const insertedIds: string[] = [];

  try {
    for (const task of tasks) {
      const { data, error } = await supabase
        .from("tasks")
        .insert({
          id: task.id,
          goal_id: goalId,
          parent_id: task.parent_id ?? null,
          depth: task.depth,
          title: task.title,
          description: task.description ?? null,
          success_criteria: task.success_criteria,
          assigned_to: task.assigned_to ?? null,
          assigned_role: task.assigned_role,
          is_agent_task: task.is_agent_task,
          status: task.status,
          deadline: task.deadline ?? null
        })
        .select("id")
        .single();

      if (error || !data) {
        throw new Error(error?.message ?? "Failed to insert task row");
      }

      insertedIds.push(data.id as string);
    }
  } catch (error) {
    if (insertedIds.length > 0) {
      await supabase.from("tasks").delete().in("id", insertedIds);
    }
    throw error;
  }
}

function flattenRoleDirectives(goalStructure: GoalStructure): Array<{ role: string; directive: string; deadline: string }> {
  return goalStructure.sub_directives.map((item) => ({
    role: item.assigned_role,
    directive: item.directive,
    deadline: item.deadline
  }));
}

export async function processDecomposeJob(job: Job<DecomposeJobData>): Promise<void> {
  const env = readEnv();
  const supabase = createSupabaseServiceClient(env);
  const goalId = job.data.goalId;

  const { data: goal, error: goalError } = await supabase
    .from("goals")
    .select("id, title, description, raw_input, priority, deadline")
    .eq("id", goalId)
    .single();

  if (goalError || !goal) {
    throw new Error(goalError?.message ?? "Goal not found for decomposition");
  }

  const ceoInput: {
    rawGoal: string;
    priority: string;
    orgContext: { organizationName: string; departments: string[] };
    deadline?: string;
  } = {
    rawGoal: String(goal.raw_input),
    priority: String(goal.priority),
    orgContext: {
      organizationName: "ORGOS",
      departments: ["finance", "operations", "engineering", "sales"]
    }
  };

  if (goal.deadline) {
    ceoInput.deadline = new Date(String(goal.deadline)).toISOString();
  }

  const ceoResult = await ceoAgent(ceoInput);

  const { error: goalUpdateError } = await supabase
    .from("goals")
    .update({
      kpi: ceoResult.kpi,
      description: ceoResult.summary,
      updated_at: new Date().toISOString()
    })
    .eq("id", goalId);

  if (goalUpdateError) {
    throw new Error(`Failed to update structured goal: ${goalUpdateError.message}`);
  }

  const directives = flattenRoleDirectives(ceoResult);
  const allTasks: Task[] = [];

  for (const directive of directives) {
    const managerTasks = await managerAgent({
      directive: directive.directive,
      department: directive.role,
      existingTasks: allTasks,
      deadline: directive.deadline,
      goalId
    });

    allTasks.push(...managerTasks);
  }

  const assignedTasks: Task[] = [];
  for (const task of allTasks) {
    const assignedTask = await assignTask(task);
    assignedTasks.push(assignedTask);
  }

  await insertTasksWithRollback(goalId, assignedTasks);

  emitGoalDecomposed({ goalId, taskCount: assignedTasks.length });
}

export function startDecomposeWorker(): Worker<DecomposeJobData> {
  const worker = new Worker<DecomposeJobData>(
    getDecomposeQueue().name,
    async (job) => {
      await processDecomposeJob(job);
    },
    {
      connection: getRedisConnection(),
      concurrency: 2
    }
  );

  worker.on("failed", (job, error) => {
    console.error("decompose worker failed", {
      jobId: job?.id,
      attemptsMade: job?.attemptsMade,
      error: error.message
    });
  });

  return worker;
}
