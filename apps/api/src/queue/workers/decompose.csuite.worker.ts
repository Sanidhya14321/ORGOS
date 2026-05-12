import { Worker, type Job } from "bullmq";
import { hierarchicalAgent } from "@orgos/agent-core";
import { ceoAgent } from "@orgos/agent-core";
import { createSupabaseServiceClient } from "../../lib/clients.js";
import { readEnv } from "../../config/env.js";
import { emitGoalDecomposed } from "../../services/notifier.js";
import { createSupabaseRagSearchClient } from "../../services/ragSearchClient.js";
import { getCsuiteQueue, getManagerQueue, getRedisConnection } from "../index.js";

interface CsuiteDecomposeJobData {
  goalId: string;
}

function flattenRoleDirectives(goalStructure: any): Array<{ role: string; directive: string; deadline: string }> {
  return (goalStructure?.sub_directives ?? []).map((item: any) => ({
    role: item.assigned_role,
    directive: item.directive,
    deadline: item.deadline
  }));
}

async function buildCeoAgentContext(supabase: ReturnType<typeof createSupabaseServiceClient>, orgId: string | null) {
  if (!orgId) {
    return {
      departments: [],
      currentRoleCapacity: {}
    };
  }

  const [positionsResult, usersResult] = await Promise.all([
    supabase
      .from("positions")
      .select("department")
      .eq("org_id", orgId),
    supabase
      .from("users")
      .select("role")
      .eq("org_id", orgId)
      .eq("status", "active")
  ]);

  const departments = Array.from(
    new Set(
      (positionsResult.data ?? [])
        .map((row) => (typeof row.department === "string" ? row.department.trim() : ""))
        .filter((value) => value.length > 0)
    )
  );

  const currentRoleCapacity = (usersResult.data ?? []).reduce<Record<string, number>>((acc, row) => {
    const role = typeof row.role === "string" ? row.role : null;
    if (!role) {
      return acc;
    }
    acc[role] = (acc[role] ?? 0) + 1;
    return acc;
  }, {});

  return {
    departments,
    currentRoleCapacity
  };
}

export async function processCsuiteDecomposeJob(job: Job<CsuiteDecomposeJobData>, agentFn = hierarchicalAgent): Promise<void> {
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

  // Build a lightweight pseudo-task representing the goal for the hierarchical agent
  const pseudoTask = {
    id: goal.id,
    goal_id: goal.id,
    title: goal.title,
    description: goal.description ?? goal.raw_input ?? null,
    depth: 0,
    success_criteria: "",
    is_agent_task: true,
    status: "pending"
  } as any;

  const agentInput = {
    task: pseudoTask,
    deadline: goal.deadline ? new Date(String(goal.deadline)).toISOString() : undefined,
    current_position: {
      id: "position:ceo",
      name: "CEO",
      level: 100,
      max_task_depth: 100,
      can_create_goals: true
    },
    org_chart: [],
    team_capacity: {}
  } as any;

  if (goal.org_id) {
    agentInput.rag = {
      orgId: String(goal.org_id),
      searchClient: ragSearchClient,
      topK: 4,
      maxSnippetChars: 400
    };
  }

  let ceoResult: any;
  try {
    ceoResult = await agentFn(agentInput as any);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isHierarchicalSchemaMismatch = message.includes("invalid_union_discriminator") && message.includes("\"action\"");
    if (!isHierarchicalSchemaMismatch) {
      throw error;
    }

    const orgContext = await buildCeoAgentContext(supabase, (goal.org_id as string | null | undefined) ?? null);
    ceoResult = await ceoAgent({
      rawGoal: goal.raw_input ?? goal.description ?? goal.title,
      priority: String(goal.priority ?? "medium"),
      orgContext,
      ...(goal.deadline ? { deadline: new Date(String(goal.deadline)).toISOString() } : {}),
      ...(goal.org_id
        ? {
            rag: {
              orgId: String(goal.org_id),
              searchClient: ragSearchClient,
              topK: 4,
              maxSnippetChars: 400
            }
          }
        : {})
    });
  }

  // If the hierarchical agent returned decomposition, create manager jobs
  if (ceoResult.action === "decompose" && Array.isArray((ceoResult as any).subtasks)) {
    const directives = (ceoResult as any).subtasks as any[];
    for (const directive of directives) {
      await getManagerQueue().add("manager_decompose", {
        mode: "decompose",
        goalId,
        directive: directive.title ?? directive.directive ?? directive.name ?? "",
        department: directive.target_position_slug ?? directive.target_position ?? directive.department ?? "general",
        deadline: directive.deadline ?? goal.deadline ?? null
      });
    }

    emitGoalDecomposed((goal.org_id as string | null | undefined) ?? null, { goalId, taskCount: directives.length, tier: "csuite" });
    await supabase
      .from("goals")
      .update({
        updated_at: new Date().toISOString()
      })
      .eq("id", goalId);
  } else if (Array.isArray((ceoResult as any).sub_directives)) {
    const directives = flattenRoleDirectives(ceoResult);
    for (const directive of directives) {
      await getManagerQueue().add("manager_decompose", {
        mode: "decompose",
        goalId,
        directive: directive.directive,
        department: directive.role,
        deadline: directive.deadline ?? goal.deadline ?? null
      });
    }

    emitGoalDecomposed((goal.org_id as string | null | undefined) ?? null, { goalId, taskCount: directives.length, tier: "csuite" });
    await supabase
      .from("goals")
      .update({
        updated_at: new Date().toISOString()
      })
      .eq("id", goalId);
  } else {
    // If not decomposed, treat as summarized
    await supabase
      .from("goals")
      .update({
        updated_at: new Date().toISOString()
      })
      .eq("id", goalId);
  }
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
