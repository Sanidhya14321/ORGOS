import { Worker, type Job } from "bullmq";
import { hierarchicalAgent } from "@orgos/agent-core";
import type { Task } from "@orgos/shared-types";
import { createSupabaseServiceClient } from "../../lib/clients.js";
import { readEnv } from "../../config/env.js";
import { buildIndividualRagOptions, buildRagProvenance } from "../../services/ragContext.js";
import { createSupabaseRagSearchClient } from "../../services/ragSearchClient.js";
import { emitAgentEscalated, emitAgentExecuting } from "../../services/notifier.js";
import { recomputeGoalRollup } from "../../services/goalEngine.js";
import { getExecuteQueue, getRedisConnection, getSynthesizeQueue } from "../index.js";

interface ExecuteJobData {
  taskId: string;
}

function deriveTaskStatusFromReportStatus(status: string | null | undefined): "completed" | "in_progress" | "blocked" {
  if (status === "blocked") {
    return "blocked";
  }

  if (status === "partial") {
    return "in_progress";
  }

  return "completed";
}

async function areAllSiblingsCompleted(taskId: string): Promise<{ allDone: boolean; parentTaskId: string | null }> {
  const env = readEnv();
  const supabase = createSupabaseServiceClient(env);

  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .select("id, parent_id")
    .eq("id", taskId)
    .single();

  if (taskError || !task) {
    throw new Error(taskError?.message ?? "Task missing for sibling check");
  }

  if (!task.parent_id) {
    return { allDone: false, parentTaskId: null };
  }

  const { data: siblings, error: siblingsError } = await supabase
    .from("tasks")
    .select("id, status")
    .eq("parent_id", task.parent_id);

  if (siblingsError) {
    throw new Error(`Failed sibling query: ${siblingsError.message}`);
  }

  const allDone = (siblings ?? []).every((sibling) => sibling.status === "completed");
  return { allDone, parentTaskId: task.parent_id as string };
}

async function resolveManagerAssignee(taskId: string): Promise<string | null> {
  const env = readEnv();
  const supabase = createSupabaseServiceClient(env);
  let cursor: string | null = taskId;

  while (cursor) {
    const result = await supabase
      .from("tasks")
      .select("id, parent_id, assigned_to, assigned_role")
      .eq("id", cursor)
      .maybeSingle();

    const error = result.error;
    const taskRow = result.data as {
      id: string;
      parent_id: string | null;
      assigned_to: string | null;
      assigned_role: string;
    } | null;

    if (error || !taskRow) {
      return null;
    }

    if (taskRow.assigned_role === "manager" && taskRow.assigned_to) {
      return taskRow.assigned_to as string;
    }

    cursor = (taskRow.parent_id as string | null) ?? null;
  }

  return null;
}

export async function processExecuteJob(job: Job<ExecuteJobData>, agentFn = hierarchicalAgent): Promise<void> {
  const env = readEnv();
  const supabase = createSupabaseServiceClient(env);

  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .select("id, org_id, goal_id, title, description, success_criteria, assigned_to, assigned_role, is_agent_task, status, deadline, parent_id, required_skills, report_id")
    .eq("id", job.data.taskId)
    .single();

  if (taskError || !task) {
    throw new Error(taskError?.message ?? "Task not found for execute job");
  }

  if (!task.is_agent_task) {
    return;
  }

  if (task.report_id && task.status === "completed") {
    return;
  }

  const { data: goal, error: goalError } = await supabase
    .from("goals")
    .select("id, org_id, title, description")
    .eq("id", task.goal_id)
    .single();

  if (goalError || !goal) {
    throw new Error(goalError?.message ?? "Goal context not found");
  }

  await supabase
    .from("tasks")
    .update({ status: "in_progress", updated_at: new Date().toISOString() })
    .eq("id", task.id);

  const managerId = await resolveManagerAssignee(task.id as string);
  emitAgentExecuting(managerId, { taskId: task.id, goalId: task.goal_id });

  const taskForAgent: Task = {
    id: task.id as string,
    goal_id: task.goal_id as string,
    parent_id: (task.parent_id as string | null) ?? null,
    depth: Number(task.parent_id ? 1 : 0) as 0 | 1 | 2,
    title: String(task.title),
    description: (task.description as string | null) ?? undefined,
    success_criteria: String(task.success_criteria),
    required_skills: (task.required_skills as string[] | null) ?? undefined,
    assigned_to: (task.assigned_to as string | null) ?? null,
    assigned_role: task.assigned_role as "ceo" | "cfo" | "manager" | "worker",
    is_agent_task: Boolean(task.is_agent_task),
    status: task.status as "pending" | "in_progress" | "blocked" | "completed" | "cancelled",
    deadline: (task.deadline as string | null) ?? undefined
  };

  const ragSearchClient = createSupabaseRagSearchClient(supabase);
  const ragOptions = buildIndividualRagOptions();
  const ragProvenance = task.org_id
    ? await ragSearchClient.search({
        orgId: String(task.org_id),
        query: `${task.title} ${task.description ?? ""} ${task.success_criteria ?? ""}`.trim(),
        topK: 4,
        ...ragOptions
      })
    : [];

  const agentInput = {
    task: taskForAgent,
    goalContext: `${goal.title} ${goal.description ?? ""}`.trim(),
    current_position: {
      id: task.assigned_to ? `user:${task.assigned_to}` : "position:worker",
      name: "worker",
      level: 1,
      max_task_depth: 10,
      can_create_goals: false
    },
    org_chart: [],
    team_capacity: {}
  } as any;

  if (task.org_id) {
    agentInput.rag = {
      orgId: String(task.org_id),
      searchClient: ragSearchClient,
      topK: 4,
      ...ragOptions
    };
  }

  const agentOutput = await agentFn(agentInput as any);

  // Normalize to previous report shape
  const report = {
    id: `report:${task.id}:${Date.now()}`,
    task_id: task.id,
    is_agent: true,
    status: (agentOutput as any).status ?? "completed",
    insight: (agentOutput as any).reasoning ?? null,
    data: (agentOutput as any).execution_plan ?? (agentOutput as any).plan ?? null,
    confidence: (agentOutput as any).confidence ?? null,
    sources: [...buildRagProvenance(ragProvenance), ...(((agentOutput as any).sources ?? []) as Array<Record<string, unknown>>)],
    escalate: (agentOutput as any).action === "escalate" || (agentOutput as any).escalate === true
  } as any;

  const nextTaskStatus = deriveTaskStatusFromReportStatus(report.status);

  const { data: insertedReport, error: reportError } = await supabase
    .from("reports")
    .insert({
      id: report.id,
      task_id: report.task_id,
      is_agent: report.is_agent,
      status: report.status,
      insight: report.insight,
      data: report.data,
      confidence: report.confidence,
      sources: report.sources ?? [],
      escalate: report.escalate
    })
    .select("id")
    .single();

  if (reportError || !insertedReport) {
    throw new Error(reportError?.message ?? "Failed to persist agent report");
  }

  await supabase
    .from("tasks")
    .update({
      status: nextTaskStatus,
      report_id: insertedReport.id,
      updated_at: new Date().toISOString()
    })
    .eq("id", task.id);

  await recomputeGoalRollup(supabase, String(task.goal_id));

  await supabase.from("agent_logs").insert({
    agent_type: "worker_agent",
    action: "execute",
    goal_id: task.goal_id,
    task_id: task.id,
    model: "internal_worker_logic",
    input: { taskId: task.id, ragDocuments: buildRagProvenance(ragProvenance) },
    output: { confidence: report.confidence, sources: report.sources ?? [] },
    error: null
  });

  if (report.escalate) {
    await supabase.from("agent_logs").insert({
      agent_type: "worker_agent",
      action: "escalate",
      goal_id: task.goal_id,
      task_id: task.id,
      model: "internal_worker_logic",
      input: { taskId: task.id },
      output: { reason: "confidence_below_threshold", confidence: report.confidence },
      error: null
    });

    console.warn("agent escalation required", { taskId: task.id, confidence: report.confidence });
    emitAgentEscalated(managerId, (task.org_id as string | null | undefined) ?? null, {
      taskId: task.id,
      goalId: task.goal_id,
      confidence: report.confidence,
      reason: "confidence_below_threshold"
    });
  }

  if (nextTaskStatus === "completed") {
    const siblingState = await areAllSiblingsCompleted(task.id as string);
    if (siblingState.allDone && siblingState.parentTaskId) {
      await getSynthesizeQueue().add(
        "sibling_synthesize",
        { parentTaskId: siblingState.parentTaskId },
        { jobId: `sibling_synthesize-${siblingState.parentTaskId}` }
      );
    }
  }
}

export function startExecuteWorker(): Worker<ExecuteJobData> {
  const worker = new Worker<ExecuteJobData>(
    getExecuteQueue().name,
    async (job) => {
      await processExecuteJob(job);
    },
    {
      connection: getRedisConnection(),
      concurrency: 2
    }
  );

  worker.on("failed", (job, error) => {
    console.error("execute worker failed", {
      jobId: job?.id,
      attemptsMade: job?.attemptsMade,
      error: error.message
    });
  });

  return worker;
}
