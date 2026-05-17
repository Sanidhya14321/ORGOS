import crypto from "node:crypto";
import { Worker, type Job } from "bullmq";
import { managerAgent } from "@orgos/agent-core";
import type { Task } from "@orgos/shared-types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServiceClient } from "../../lib/clients.js";
import { readEnv } from "../../config/env.js";
import { assignTask } from "../../services/assignmentEngine.js";
import { suggestRoutingForTask } from "../../services/agentService.js";
import { buildManagerRagOptions, buildRagProvenance } from "../../services/ragContext.js";
import { createSupabaseRagSearchClient } from "../../services/ragSearchClient.js";
import { emitTaskAssigned, emitToUser } from "../../services/notifier.js";
import { syncUserOpenTaskCounts } from "../../services/workloadService.js";
import { getExecuteQueue, getIndividualQueue, getManagerQueue, getRedisConnection } from "../index.js";

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

export type { ManagerJobData };

type ManagerWorkerDependencies = {
  supabase?: SupabaseClient;
  assignTaskFn?: typeof assignTask;
  managerAgentFn?: typeof managerAgent;
  enqueueIndividualAck?: (taskId: string) => Promise<void>;
  enqueueExecute?: (taskId: string) => Promise<void>;
  emitTaskAssignedFn?: typeof emitTaskAssigned;
  emitToUserFn?: typeof emitToUser;
};

function buildFallbackManagerTasks(job: Extract<ManagerJobData, { mode: "decompose" }>): Task[] {
  const normalizedDeadline = job.deadline && !Number.isNaN(Date.parse(job.deadline))
    ? new Date(job.deadline).toISOString()
    : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const normalizedDepartment = job.department?.trim() || "operations";
  const financeLike = /finance|financial|budget|cfo/i.test(`${normalizedDepartment} ${job.directive}`);
  const assignedRole = financeLike ? "cfo" : "worker";

  return [
    {
      id: crypto.randomUUID(),
      goal_id: job.goalId,
      parent_id: null,
      depth: 1,
      title: `Prepare ${normalizedDepartment} execution plan`,
      description: job.directive,
      success_criteria: `A clear ${normalizedDepartment} execution plan is documented with accountable owners and checkpoints.`,
      assigned_to: null,
      assigned_role: assignedRole,
      is_agent_task: false,
      status: "pending",
      deadline: normalizedDeadline
    },
    {
      id: crypto.randomUUID(),
      goal_id: job.goalId,
      parent_id: null,
      depth: 1,
      title: `Collect ${normalizedDepartment} readiness evidence`,
      description: `Gather the evidence, blockers, and status updates needed to complete: ${job.directive}`,
      success_criteria: `Completion evidence and blockers for ${normalizedDepartment} are captured and ready for review.`,
      assigned_to: null,
      assigned_role: assignedRole,
      is_agent_task: false,
      status: "pending",
      deadline: normalizedDeadline
    }
  ];
}

async function insertTasksWithRollback(params: {
  supabase: SupabaseClient;
  goalId: string;
  goalOrgId: string | null;
  goalCreatorId: string | null;
  tasks: Task[];
}): Promise<void> {
  const { supabase, goalId, goalOrgId, goalCreatorId, tasks } = params;
  const insertedIds: string[] = [];
  const affectedAssigneeIds = new Set<string>();

  try {
    for (const task of tasks) {
      const { data, error } = await supabase
        .from("tasks")
        .insert({
          id: task.id,
          org_id: goalOrgId,
          created_by: goalCreatorId,
          owner_id: goalCreatorId,
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
        affectedAssigneeIds.add(task.assigned_to);
      }
    }

    await syncUserOpenTaskCounts(supabase, [...affectedAssigneeIds]);
  } catch (error) {
    if (insertedIds.length > 0) {
      await supabase.from("tasks").delete().in("id", insertedIds);
    }
    await syncUserOpenTaskCounts(supabase, [...affectedAssigneeIds]);
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
  const enqueueExecute = dependencies.enqueueExecute ?? (async (taskId: string) => {
    await getExecuteQueue().add("task_execute", { taskId }, { jobId: `task_execute-${taskId}` });
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
    .select("id, org_id, created_by")
    .eq("id", job.data.goalId)
    .maybeSingle();

  const ragSearchClient = createSupabaseRagSearchClient(supabase);
  const ragOptions = buildManagerRagOptions({ department: job.data.department });
  const ragProvenance = goalResult.data?.org_id
    ? await ragSearchClient.search({
        orgId: String(goalResult.data.org_id),
        query: [job.data.directive, job.data.department, existingTasks.map((task) => task.title).join(" ")].filter(Boolean).join(" "),
        topK: 4,
        ...ragOptions
      })
    : [];

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
      ...ragOptions
    };
  }

  let managerTasks: Task[] = [];
  try {
    managerTasks = await managerAgentFn(managerInput);
  } catch {
    managerTasks = buildFallbackManagerTasks(job.data);
  }

  if (managerTasks.length === 0) {
    managerTasks = buildFallbackManagerTasks(job.data);
  }

  const assignedTasks: Task[] = [];
  for (const task of managerTasks) {
    const assignedTask = await assignTaskFn(task, {
      persistTaskUpdate: false,
      reserveCapacity: false,
      emitAssignmentEvent: false
    });
    assignedTasks.push(assignedTask);
  }

  await insertTasksWithRollback({
    supabase,
    goalId: job.data.goalId,
    goalOrgId: (goalResult.data?.org_id as string | null | undefined) ?? null,
    goalCreatorId: (goalResult.data?.created_by as string | null | undefined) ?? null,
    tasks: assignedTasks
  });

  for (const task of assignedTasks) {
    if (task.assigned_to) {
      emitTaskAssignedFn(task.assigned_to, {
        taskId: task.id,
        role: task.assigned_role,
        isAgentTask: task.is_agent_task
      });
      await enqueueIndividualAck(task.id);
    } else if (task.is_agent_task) {
      await enqueueExecute(task.id);
    }
  }

  await supabase.from("agent_logs").insert({
    goal_id: job.data.goalId,
    agent_type: "manager_agent",
    action: "decompose",
    model: "manager_agent",
    input: {
      directive: job.data.directive,
      department: job.data.department,
      ragDocuments: buildRagProvenance(ragProvenance)
    },
    output: {
      taskCount: assignedTasks.length,
      tasks: assignedTasks.map((task) => ({
        id: task.id,
        title: task.title,
        assigned_role: task.assigned_role,
        is_agent_task: task.is_agent_task
      }))
    }
  });
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
