import { Worker, type Job } from "bullmq";
import { individualAgent } from "@orgos/agent-core";
import { createSupabaseServiceClient } from "../../lib/clients.js";
import { readEnv } from "../../config/env.js";
import { emitToUser } from "../../services/notifier.js";
import { getIndividualQueue, getRedisConnection } from "../index.js";

interface IndividualAckJobData {
  taskId: string;
}

export async function processIndividualAckJob(job: Job<IndividualAckJobData>): Promise<void> {
  const env = readEnv();
  const supabase = createSupabaseServiceClient(env);

  const taskResult = await supabase
    .from("tasks")
    .select("id, title, description, success_criteria, deadline, assigned_to, parent_id")
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

  const output = await individualAgent({
    taskId: String(task.id),
    title: String(task.title),
    description: typeof task.description === "string" ? task.description : null,
    successCriteria: String(task.success_criteria),
    assigneeSkills: Array.isArray(assigneeResult.data?.skills)
      ? assigneeResult.data.skills.filter((value): value is string => typeof value === "string")
      : [],
    deadline: typeof task.deadline === "string" ? task.deadline : null,
    ...(parentContext ? { parentContext } : {})
  });

  if (output.questions.length > 0) {
    const managerId = typeof assigneeResult.data?.reports_to === "string" ? assigneeResult.data.reports_to : null;
    if (managerId) {
      emitToUser(managerId, "task:blocked", {
        taskId: task.id,
        questions: output.questions,
        etaHours: output.eta_hours,
        confidence: output.confidence
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
