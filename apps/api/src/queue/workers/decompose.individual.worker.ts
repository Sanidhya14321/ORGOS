import { Worker, type Job } from "bullmq";
import { hierarchicalAgent } from "@orgos/agent-core";
import { createSupabaseServiceClient } from "../../lib/clients.js";
import { readEnv } from "../../config/env.js";
import { createSupabaseRagSearchClient } from "../../services/ragSearchClient.js";
import { emitToUser } from "../../services/notifier.js";
import { getIndividualQueue, getRedisConnection } from "../index.js";

interface IndividualAckJobData {
  taskId: string;
}

export async function processIndividualAckJob(job: Job<IndividualAckJobData>, agentFn = hierarchicalAgent): Promise<void> {
  const env = readEnv();
  const supabase = createSupabaseServiceClient(env);

  const taskResult = await supabase
    .from("tasks")
    .select("id, org_id, goal_id, title, description, success_criteria, deadline, assigned_to, parent_id")
    .eq("id", job.data.taskId)
    .maybeSingle();

  if (taskResult.error || !taskResult.data) {
    throw new Error(taskResult.error?.message ?? "Task not found for individual acknowledgment");
  }

  const task = taskResult.data;
  if (!task.assigned_to) {
    return;
  }

  const assigneeResult = await supabase
    .from("users")
    .select("id, skills, reports_to")
    .eq("id", task.assigned_to)
    .maybeSingle();

  const parentTaskResult = task.parent_id
    ? await supabase.from("tasks").select("title").eq("id", task.parent_id).maybeSingle()
    : { data: null, error: null };
  const parentContext = typeof parentTaskResult.data?.title === "string" ? parentTaskResult.data.title : null;
  const ragSearchClient = createSupabaseRagSearchClient(supabase);

  const agentInput = {
    task: {
      id: task.id,
      goal_id: task.goal_id,
      title: task.title,
      description: typeof task.description === "string" ? task.description : null,
      success_criteria: task.success_criteria,
      assigned_to: task.assigned_to
    },
    current_position: {
      id: `user:${task.assigned_to}`,
      name: "assignee",
      level: 1,
      max_task_depth: 10,
      can_create_goals: false
    },
    parent_task: parentContext ? { title: parentContext } : undefined,
    team_capacity: {},
    org_chart: []
  } as any;

  if (task.org_id) {
    agentInput.rag = {
      orgId: String(task.org_id),
      searchClient: ragSearchClient,
      topK: 4,
      maxSnippetChars: 400
    };
  }

  const output = await agentFn(agentInput as any);

  const questions = (output as any).questions ?? [];
  if (questions.length > 0) {
    const managerId = typeof assigneeResult.data?.reports_to === "string" ? assigneeResult.data.reports_to : null;
    if (managerId) {
      emitToUser(managerId, "task:blocked", {
        taskId: task.id,
        questions,
        etaHours: (output as any).eta_hours ?? null,
        confidence: (output as any).confidence ?? null
      });
    }
  }
}

export function startIndividualAckWorker(): Worker<IndividualAckJobData> {
  const worker = new Worker<IndividualAckJobData>(
    getIndividualQueue().name,
    async (job) => {
      await processIndividualAckJob(job);
    },
    {
      connection: getRedisConnection(),
      concurrency: 20
    }
  );

  worker.on("failed", (job, error) => {
    console.error("individual acknowledge worker failed", {
      jobId: job?.id,
      attemptsMade: job?.attemptsMade,
      error: error.message
    });
  });

  return worker;
}
