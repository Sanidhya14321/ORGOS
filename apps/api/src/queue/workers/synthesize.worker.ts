import crypto from "node:crypto";
import { Worker, type Job } from "bullmq";
import { synthesisAgent } from "@orgos/agent-core";
import { createSupabaseServiceClient } from "../../lib/clients.js";
import { readEnv } from "../../config/env.js";
import { buildRagProvenance, buildSynthesisRagOptions } from "../../services/ragContext.js";
import { createSupabaseRagSearchClient } from "../../services/ragSearchClient.js";
import { getRedisConnection, getSynthesizeQueue } from "../index.js";
import { emitTaskReportSubmittedCascade } from "../../services/notifier.js";
import { recomputeGoalRollup } from "../../services/goalEngine.js";

interface SynthesizeJobData {
  parentTaskId: string;
}

async function enqueueParentIfReady(parentTaskId: string): Promise<void> {
  const env = readEnv();
  const supabase = createSupabaseServiceClient(env);

  const { data: parentTask } = await supabase
    .from("tasks")
    .select("id, parent_id")
    .eq("id", parentTaskId)
    .maybeSingle();

  if (!parentTask?.parent_id) {
    return;
  }

  const { data: siblings } = await supabase
    .from("tasks")
    .select("status")
    .eq("parent_id", parentTask.parent_id);

  const allDone = (siblings ?? []).every((sibling) => sibling.status === "completed");
  if (allDone) {
    await getSynthesizeQueue().add(
      "cascade_synthesize",
      { parentTaskId: parentTask.parent_id as string },
      { jobId: `cascade_synthesize-${parentTask.parent_id as string}` }
    );
  }
}

export async function processSynthesizeJob(job: Job<SynthesizeJobData>): Promise<void> {
  const env = readEnv();
  const supabase = createSupabaseServiceClient(env);

  const { data: parentTask, error: parentError } = await supabase
    .from("tasks")
    .select("id, org_id, goal_id, title, success_criteria, report_id")
    .eq("id", job.data.parentTaskId)
    .single();

  if (parentError || !parentTask) {
    throw new Error(parentError?.message ?? "Parent task not found");
  }

  if (parentTask.report_id) {
    return;
  }

  const { data: children, error: childrenError } = await supabase
    .from("tasks")
    .select("id")
    .eq("parent_id", parentTask.id);

  if (childrenError) {
    throw new Error(`Failed to load child tasks: ${childrenError.message}`);
  }

  const childTaskIds = (children ?? []).map((child) => child.id as string);
  if (childTaskIds.length === 0) {
    return;
  }

  const { data: reports, error: reportsError } = await supabase
    .from("reports")
    .select("id, task_id, insight, data, confidence, escalate")
    .in("task_id", childTaskIds);

  if (reportsError) {
    throw new Error(`Failed to load child reports: ${reportsError.message}`);
  }

  const { data: goal } = await supabase
    .from("goals")
    .select("org_id, title, description")
    .eq("id", parentTask.goal_id)
    .maybeSingle();

  const ragSearchClient = createSupabaseRagSearchClient(supabase);
  const ragOptions = buildSynthesisRagOptions();
  const ragProvenance = parentTask.org_id
    ? await ragSearchClient.search({
        orgId: String(parentTask.org_id),
        query: `${parentTask.title} ${goal?.title ?? ""} ${goal?.description ?? ""}`.trim(),
        topK: 4,
        ...ragOptions
      })
    : [];

  const synthesis = await synthesisAgent({
    parentTask: {
      id: parentTask.id as string,
      title: parentTask.title as string,
      success_criteria: parentTask.success_criteria as string
    },
    childReports: (reports ?? []).map((report) => ({
      id: report.id as string,
      task_id: report.task_id as string,
      insight: report.insight as string,
      data: (report.data as Record<string, unknown>) ?? {},
      confidence: Number(report.confidence ?? 0),
      escalate: Boolean(report.escalate)
    })),
    goalContext: `${goal?.title ?? ""} ${goal?.description ?? ""}`.trim(),
    ...(parentTask.org_id
      ? {
          rag: {
            orgId: String(parentTask.org_id),
            searchClient: ragSearchClient,
            topK: 4,
            ...ragOptions
          }
        }
      : {})
  });

  const synthesisReportId = crypto.randomUUID();

  const { error: insertError } = await supabase.from("reports").insert({
    id: synthesisReportId,
    task_id: parentTask.id,
    submitted_by: null,
    is_agent: true,
    status: "completed",
    insight: synthesis.summary,
    data: {
      key_findings: synthesis.key_findings,
      contradictions: synthesis.contradictions,
      recommended_action: synthesis.recommended_action,
      flagged_items: synthesis.flagged_items
    },
    confidence: synthesis.overall_confidence,
    sources: buildRagProvenance(ragProvenance),
    escalate: synthesis.flagged_items.length > 0
  });

  if (insertError) {
    throw new Error(`Failed to insert synthesis report: ${insertError.message}`);
  }

  await supabase
    .from("tasks")
    .update({ status: "completed", report_id: synthesisReportId, updated_at: new Date().toISOString() })
    .eq("id", parentTask.id);

  await recomputeGoalRollup(supabase, String(parentTask.goal_id));

  await supabase.from("agent_logs").insert({
    goal_id: parentTask.goal_id,
    task_id: parentTask.id,
    agent_type: "synthesis_agent",
    action: "synthesize",
    model: "synthesis_agent",
    input: { parentTaskId: parentTask.id, ragDocuments: buildRagProvenance(ragProvenance) },
    output: {
      summary: synthesis.summary,
      flagged_items: synthesis.flagged_items,
      overall_confidence: synthesis.overall_confidence
    }
  });

  await enqueueParentIfReady(parentTask.id as string);

  await emitTaskReportSubmittedCascade(parentTask.id as string, {
    reportId: synthesisReportId,
    isAgent: true,
    overall_confidence: synthesis.overall_confidence
  });
}

export function startSynthesizeWorker(): Worker<SynthesizeJobData> {
  const worker = new Worker<SynthesizeJobData>(
    getSynthesizeQueue().name,
    async (job) => {
      await processSynthesizeJob(job);
    },
    {
      connection: getRedisConnection(),
      concurrency: 2
    }
  );

  worker.on("failed", (job, error) => {
    console.error("synthesize worker failed", {
      jobId: job?.id,
      attemptsMade: job?.attemptsMade,
      error: error.message
    });
  });

  return worker;
}
