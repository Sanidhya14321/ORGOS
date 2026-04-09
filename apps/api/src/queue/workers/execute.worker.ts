import { Worker, type Job } from "bullmq";
import { workerAgent } from "@orgos/agent-core";
import type { Task } from "@orgos/shared-types";
import { createSupabaseServiceClient } from "../../lib/clients.js";
import { readEnv } from "../../config/env.js";
import { emitAgentEscalated, emitAgentExecuting } from "../../services/notifier.js";
import { synthesizeQueue, executeQueue, redisConnection } from "../index.js";

interface ExecuteJobData {
  taskId: string;
}

const env = readEnv();

async function areAllSiblingsCompleted(taskId: string): Promise<{ allDone: boolean; parentTaskId: string | null }> {
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

export async function processExecuteJob(job: Job<ExecuteJobData>): Promise<void> {
  const supabase = createSupabaseServiceClient(env);

  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .select("id, goal_id, title, description, success_criteria, assigned_to, assigned_role, is_agent_task, status, deadline, parent_id, required_skills")
    .eq("id", job.data.taskId)
    .single();

  if (taskError || !task) {
    throw new Error(taskError?.message ?? "Task not found for execute job");
  }

  if (!task.is_agent_task) {
    return;
  }

  const { data: goal, error: goalError } = await supabase
    .from("goals")
    .select("id, title, description")
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

  const report = await workerAgent({
    task: taskForAgent,
    goalContext: `${goal.title} ${goal.description ?? ""}`.trim()
  });

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
      status: "completed",
      report_id: insertedReport.id,
      updated_at: new Date().toISOString()
    })
    .eq("id", task.id);

  await supabase.from("agent_logs").insert({
    agent_type: "worker_agent",
    action: "execute",
    goal_id: task.goal_id,
    task_id: task.id,
    model: "internal_worker_logic",
    input: { taskId: task.id },
    output: { confidence: report.confidence },
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
    emitAgentEscalated(managerId, {
      taskId: task.id,
      goalId: task.goal_id,
      confidence: report.confidence,
      reason: "confidence_below_threshold"
    });
  }

  const siblingState = await areAllSiblingsCompleted(task.id as string);
  if (siblingState.allDone && siblingState.parentTaskId) {
    await synthesizeQueue.add("sibling_synthesize", { parentTaskId: siblingState.parentTaskId });
  }
}

export function startExecuteWorker(): Worker<ExecuteJobData> {
  const worker = new Worker<ExecuteJobData>(
    executeQueue.name,
    async (job) => {
      await processExecuteJob(job);
    },
    {
      connection: redisConnection,
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
