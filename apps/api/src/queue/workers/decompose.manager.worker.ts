import { Worker, type Job } from "bullmq";
import { managerAgent } from "@orgos/agent-core";
import type { Task } from "@orgos/shared-types";
import { createSupabaseServiceClient } from "../../lib/clients.js";
import { readEnv } from "../../config/env.js";
import { assignTask } from "../../services/assignmentEngine.js";
import { suggestRoutingForTask } from "../../services/agentService.js";
import { emitToUser } from "../../services/notifier.js";
import { getIndividualQueue, getManagerQueue, getRedisConnection } from "../index.js";

interface ManagerDecomposeJobData {
  goalId: string;
  directive: string;
  department: string;
  deadline: string;
}

interface ManagerRoutingSuggestJobData {
  taskId: string;
}

type ManagerJobData =
  | ({ mode: "decompose" } & ManagerDecomposeJobData)
  | ({ mode: "routing_suggest" } & ManagerRoutingSuggestJobData);

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

export async function processManagerDecomposeJob(job: Job<ManagerJobData>): Promise<void> {
  const env = readEnv();
  const supabase = createSupabaseServiceClient(env);

  if (job.data.mode === "routing_suggest") {
    const taskId = job.data.taskId;
    const fakeFastify = {
      supabaseService: supabase,
      log: {
        warn: (...args: unknown[]) => console.warn(...args),
        error: (...args: unknown[]) => console.error(...args)
      }
    } as Parameters<typeof suggestRoutingForTask>[0];

    const generated = await suggestRoutingForTask(fakeFastify, taskId);

    if (generated.suggestions.length > 0) {
      await supabase.from("routing_suggestions").insert({
        task_id: taskId,
        suggested: generated.suggestions,
        confirmed: null,
        outcome: null
      });
    }

    const ownerLookup = await supabase
      .from("tasks")
      .select("created_by")
      .eq("id", taskId)
      .maybeSingle();

    const ownerId = typeof ownerLookup.data?.created_by === "string" ? ownerLookup.data.created_by : null;
    if (ownerId) {
      emitToUser(ownerId, "task:routing_ready", {
        taskId,
        suggestions: generated.suggestions
      });
    }

    return;
  }

  const existingTasksResult = await supabase
    .from("tasks")
    .select("*")
    .eq("goal_id", job.data.goalId)
    .order("created_at", { ascending: true });

  const existingTasks = ((existingTasksResult.data ?? []) as Task[]).slice(0, 50);

  const managerTasks = await managerAgent({
    directive: job.data.directive,
    department: job.data.department,
    existingTasks,
    deadline: job.data.deadline,
    goalId: job.data.goalId
  });

  const assignedTasks: Task[] = [];
  for (const task of managerTasks) {
    const assignedTask = await assignTask(task);
    assignedTasks.push(assignedTask);
  }

  await insertTasksWithRollback(job.data.goalId, assignedTasks);

  for (const task of assignedTasks) {
    if (task.assigned_to) {
      await getIndividualQueue().add("individual_ack", { taskId: task.id });
    }
  }
}

export function startManagerDecomposeWorker(): Worker<ManagerJobData> {
  const worker = new Worker<ManagerJobData>(
    getManagerQueue().name,
    async (job) => {
      await processManagerDecomposeJob(job);
    },
    {
      connection: getRedisConnection(),
      concurrency: 5
    }
  );

  worker.on("failed", (job, error) => {
    console.error("manager decompose worker failed", {
      jobId: job?.id,
      attemptsMade: job?.attemptsMade,
      error: error.message
    });
  });

  return worker;
}
