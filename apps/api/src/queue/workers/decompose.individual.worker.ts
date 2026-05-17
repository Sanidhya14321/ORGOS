import { Worker, type Job } from "bullmq";
import { individualAgent, type IndividualAgentOutput } from "@orgos/agent-core";
import { createSupabaseServiceClient } from "../../lib/clients.js";
import { readEnv } from "../../config/env.js";
import { buildIndividualRagOptions } from "../../services/ragContext.js";
import { createSupabaseRagSearchClient } from "../../services/ragSearchClient.js";
import { emitToUser } from "../../services/notifier.js";
import { getIndividualQueue, getRedisConnection } from "../index.js";

interface IndividualAckJobData {
  taskId: string;
}

export async function processIndividualAckJob(
  job: Job<IndividualAckJobData>,
  agentFn: typeof individualAgent = individualAgent
): Promise<void> {
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
  const parentContext = typeof parentTaskResult.data?.title === "string" ? parentTaskResult.data.title : undefined;
  const ragSearchClient = createSupabaseRagSearchClient(supabase);
  const assigneeSkills = Array.isArray(assigneeResult.data?.skills)
    ? assigneeResult.data.skills.filter((skill): skill is string => typeof skill === "string" && skill.trim().length > 0)
    : [];

  const agentInput: Parameters<typeof individualAgent>[0] = {
    taskId: String(task.id),
    title: String(task.title),
    description: typeof task.description === "string" ? task.description : null,
    successCriteria: String(task.success_criteria),
    assigneeSkills
  };

  if (typeof task.deadline === "string") {
    agentInput.deadline = task.deadline;
  }
  if (parentContext) {
    agentInput.parentContext = parentContext;
  }

  if (task.org_id) {
    const ragOptions = buildIndividualRagOptions();
    agentInput.rag = {
      orgId: String(task.org_id),
      searchClient: ragSearchClient,
      topK: 4,
      ...ragOptions
    };
  }

  const output: IndividualAgentOutput = await agentFn(agentInput);

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
