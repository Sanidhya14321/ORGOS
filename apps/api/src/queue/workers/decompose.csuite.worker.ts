import { Worker, type Job } from "bullmq";
import { ceoAgent, type GoalStructure } from "@orgos/agent-core";
import { createSupabaseServiceClient } from "../../lib/clients.js";
import { readEnv } from "../../config/env.js";
import { emitGoalDecomposed } from "../../services/notifier.js";
import { createSupabaseRagSearchClient } from "../../services/ragSearchClient.js";
import { getCsuiteQueue, getManagerQueue, getRedisConnection } from "../index.js";

interface CsuiteDecomposeJobData {
  goalId: string;
}

function flattenRoleDirectives(goalStructure: GoalStructure): Array<{ role: string; directive: string; deadline: string }> {
  return goalStructure.sub_directives.map((item) => ({
    role: item.assigned_role,
    directive: item.directive,
    deadline: item.deadline
  }));
}

export async function processCsuiteDecomposeJob(job: Job<CsuiteDecomposeJobData>): Promise<void> {
  const env = readEnv();
  const supabase = createSupabaseServiceClient(env);
  const goalId = job.data.goalId;

  const { data: goal, error: goalError } = await supabase
    .from("goals")
    .select("id, org_id, title, description, raw_input, priority, deadline")
    .eq("id", goalId)
    .single();

  if (goalError || !goal) {
    throw new Error(goalError?.message ?? "Goal not found for c-suite decomposition");
  }

  const ragSearchClient = createSupabaseRagSearchClient(supabase);

  const ceoInput = {
    rawGoal: String(goal.raw_input),
    priority: String(goal.priority),
    orgContext: {
      organizationName: "ORGOS",
      departments: ["engineering", "product", "marketing", "operations", "sales"]
    }
  } as const;

  if (goal.org_id) {
    (ceoInput as any).rag = {
      orgId: String(goal.org_id),
      searchClient: ragSearchClient,
      topK: 4,
      maxSnippetChars: 400
    };
  }

  if (goal.deadline) {
    (ceoInput as any).deadline = new Date(String(goal.deadline)).toISOString();
  }

  const ceoResult = await ceoAgent(ceoInput as any);

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
  for (const directive of directives) {
    await getManagerQueue().add("manager_decompose", {
      mode: "decompose",
      goalId,
      directive: directive.directive,
      department: directive.role,
      deadline: directive.deadline
    });
  }

  emitGoalDecomposed({ goalId, taskCount: directives.length, tier: "csuite" });
}

export function startCsuiteDecomposeWorker(): Worker<CsuiteDecomposeJobData> {
  const worker = new Worker<CsuiteDecomposeJobData>(
    getCsuiteQueue().name,
    async (job) => {
      await processCsuiteDecomposeJob(job);
    },
    {
      connection: getRedisConnection(),
      concurrency: 2
    }
  );

  worker.on("failed", (job, error) => {
    console.error("csuite decompose worker failed", {
      jobId: job?.id,
      attemptsMade: job?.attemptsMade,
      error: error.message
    });
  });

  return worker;
}
