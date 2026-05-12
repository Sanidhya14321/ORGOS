import { Worker, type Job } from "bullmq";
import { managerAgent } from "@orgos/agent-core";
import type { Task } from "@orgos/shared-types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServiceClient } from "../../lib/clients.js";
import { readEnv } from "../../config/env.js";
import { assignTask } from "../../services/assignmentEngine.js";
import { suggestRoutingForTask } from "../../services/agentService.js";
import { createSupabaseRagSearchClient } from "../../services/ragSearchClient.js";
import { emitTaskAssigned, emitToUser } from "../../services/notifier.js";
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

type ManagerWorkerDependencies = {
  supabase?: SupabaseClient;
  assignTaskFn?: typeof assignTask;
  managerAgentFn?: typeof managerAgent;
  enqueueIndividualAck?: (taskId: string) => Promise<void>;
  emitTaskAssignedFn?: typeof emitTaskAssigned;
  emitToUserFn?: typeof emitToUser;
};

async function applyOpenTaskCountIncrements(
  supabase: SupabaseClient,
  increments: Map<string, number>
): Promise<void> {
  if (increments.size === 0) {
    return;
  }

  const assigneeIds = [...increments.keys()];
  const usersResult = await supabase
    .from("users")
    .select("id, open_task_count")
    .in("id", assigneeIds);

  if (usersResult.error) {
    throw new Error(`Failed to load assignee workloads: ${usersResult.error.message}`);
  }

  const previousCounts = new Map<string, number>();
  for (const row of usersResult.data ?? []) {
    previousCounts.set(row.id as string, Number(row.open_task_count ?? 0));
  }

  for (const assigneeId of assigneeIds) {
    if (!previousCounts.has(assigneeId)) {
      throw new Error(`Missing assignee workload row for ${assigneeId}`);
    }
  }

  const updatedIds: string[] = [];

  try {
    for (const assigneeId of assigneeIds) {
      const previousCount = previousCounts.get(assigneeId) ?? 0;
      const nextCount = previousCount + (increments.get(assigneeId) ?? 0);
      const updateResult = await supabase
        .from("users")
        .update({ open_task_count: nextCount })
        .eq("id", assigneeId);

      if (updateResult.error) {
        throw new Error(`Failed to update assignee workload: ${updateResult.error.message}`);
      }

      updatedIds.push(assigneeId);
    }
  } catch (error) {
    for (const assigneeId of updatedIds) {
      await supabase
        .from("users")
        .update({ open_task_count: previousCounts.get(assigneeId) ?? 0 })
        .eq("id", assigneeId);
    }

    throw error;
  }
}

async function insertTasksWithRollback(supabase: SupabaseClient, goalId: string, tasks: Task[]): Promise<void> {
  const insertedIds: string[] = [];
  const workloadIncrements = new Map<string, number>();

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
          assigned_position_id: (task as Task & { assigned_position_id?: string | null }).assigned_position_id ?? null,
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

      if (task.assigned_to) {
        workloadIncrements.set(task.assigned_to, (workloadIncrements.get(task.assigned_to) ?? 0) + 1);
      }
    }

    await applyOpenTaskCountIncrements(supabase, workloadIncrements);
  } catch (error) {
    if (insertedIds.length > 0) {
      await supabase.from("tasks").delete().in("id", insertedIds);
    }
    throw error;
  }
}

export async function processManagerDecomposeJob(job: Job<ManagerJobData>, dependencies: ManagerWorkerDependencies = {}): Promise<void> {
  const supabase = dependencies.supabase ?? createSupabaseServiceClient(readEnv());
  const assignTaskFn = dependencies.assignTaskFn ?? assignTask;
  const managerAgentFn = dependencies.managerAgentFn ?? managerAgent;
  const enqueueIndividualAck = dependencies.enqueueIndividualAck ?? (async (taskId: string) => {
    await getIndividualQueue().add("individual_ack", { taskId });
  });
  const emitTaskAssignedFn = dependencies.emitTaskAssignedFn ?? emitTaskAssigned;
  const emitToUserFn = dependencies.emitToUserFn ?? emitToUser;

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
      emitToUserFn(ownerId, "task:routing_ready", {
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

  const goalResult = await supabase
    .from("goals")
    .select("id, org_id")
    .eq("id", job.data.goalId)
    .maybeSingle();

  const ragSearchClient = createSupabaseRagSearchClient(supabase);

  const managerInput = {
    directive: job.data.directive,
    department: job.data.department,
    existingTasks,
    deadline: job.data.deadline,
    goalId: job.data.goalId
  } as any;

  if (goalResult.data?.org_id) {
    managerInput.rag = {
      orgId: String(goalResult.data.org_id),
      searchClient: ragSearchClient,
      topK: 4,
      maxSnippetChars: 400
    };
  }

  const managerTasks = await managerAgentFn(managerInput);

  const assignedTasks: Task[] = [];
  for (const task of managerTasks) {
    const assignedTask = await assignTaskFn(task, {
      persistTaskUpdate: false,
      reserveCapacity: false,
      emitAssignmentEvent: false
    });
    assignedTasks.push(assignedTask);
  }

  await insertTasksWithRollback(supabase, job.data.goalId, assignedTasks);

  for (const task of assignedTasks) {
    if (task.assigned_to) {
      emitTaskAssignedFn(task.assigned_to, {
        taskId: task.id,
        role: task.assigned_role,
        isAgentTask: task.is_agent_task
      });
      await enqueueIndividualAck(task.id);
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
