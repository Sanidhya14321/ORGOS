import type { Job } from "bullmq";
import type { FastifyInstance } from "fastify";
import { hierarchicalAgent, HierarchicalAgentOutputSchema } from "@orgos/agent-core";
import type {
  HierarchicalQueueJob,
  DecompositionResult,
  DelegationResult,
  ExecutionPlan,
  EscalationDetails,
} from "@orgos/agent-core";
import type { Task, Position } from "@orgos/shared-types";
// Use Fastify app logger available in the worker context (app.log)

/**
 * Hierarchical decomposition worker
 * 
 * Handles decomposition/delegation/execution decisions at ANY level of the org
 * using the unified hierarchical agent.
 * 
 * Replaces:
 * - decompose.csuite.worker.ts (CEO decomposition)
 * - decompose.manager.worker.ts (Manager decomposition)
 * - execute.worker.ts (Worker execution)
 */

interface WorkerContext {
  app: FastifyInstance;
  supabase: any;
  rag?: any;
}

export async function createHierarchicalWorker(context: WorkerContext) {
  const { app, supabase, rag } = context;

  return async (job: Job<HierarchicalQueueJob>) => {
    const startTime = Date.now();
    const jobData = job.data;

    try {
      (app.log as any).info(`[HIERARCHICAL] Processing task: ${jobData.task.id}`, {
        position: jobData.current_position.name,
        title: jobData.task.title,
        depth: jobData.task.depth,
      });

      // Step 1: Validate position can act on this task
      validatePositionAuthority(jobData);

      // Step 2: Fetch org context
      const orgContext = await fetchOrgContext(supabase, jobData.org_id, jobData.current_position);

      // Step 3: Call hierarchical agent
      const agentResult = await hierarchicalAgent({
        task: jobData.task,
        deadline: jobData.deadline,
        current_position: jobData.current_position,
        org_chart: orgContext.chart,
        team_capacity: orgContext.capacity,
        parent_task: jobData.parent_task,
        sibling_tasks: jobData.sibling_tasks,
        // Allow optional RAG context (cast to any to satisfy agent input typings)
      } as any);

      (app.log as any).debug(`[HIERARCHICAL] Agent decision`, {
        decision: agentResult.action,
        confidence: (agentResult as any).confidence ?? null,
      });

      // Step 4: Handle decision
      const result = await handleDecision(agentResult, jobData, supabase, orgContext);

      // Step 5: Store result
      await storeResult(supabase, jobData, result);

      // Step 6: Create follow-up queue jobs if needed
      await createFollowUpJobs(
        app,
        jobData.org_id,
        jobData.current_position,
        result,
        supabase,
        orgContext
      );

      const duration = Date.now() - startTime;
      (app.log as any).info(`[HIERARCHICAL] Task completed`, {
        taskId: jobData.task.id,
        decision: agentResult.action,
        duration,
      });

      return {
        success: true,
        decision: agentResult.action,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      (app.log as any).error(`[HIERARCHICAL] Task failed`, {
        taskId: jobData.task.id,
        error: error instanceof Error ? error.message : String(error),
        duration,
      });

      // Store error state
      await supabase
        .from("tasks")
        .update({
          status: "failed",
          error_message: error instanceof Error ? error.message : "Unknown error",
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobData.task.id);

      throw error;
    }
  };
}

/**
 * Validate that position has authority for this task
 */
function validatePositionAuthority(job: HierarchicalQueueJob): void {
  const { current_position, task } = job;

  // Check depth limit
  if (task.depth >= current_position.max_task_depth) {
    throw new Error(
      `Position ${current_position.name} cannot handle tasks at depth ${task.depth} (max: ${current_position.max_task_depth})`
    );
  }

  // Check capabilities
  if (task.status === "pending" && !current_position.can_create_goals) {
    throw new Error(`Position ${current_position.name} cannot create goals`);
  }
}

/**
 * Fetch org context: chart, capacity, etc.
 */
async function fetchOrgContext(
  supabase: any,
  orgId: string,
  position: Position
): Promise<{
  chart: Position[];
  capacity: Record<string, any>;
}> {
  // Fetch full org chart
  const { data: chart, error: chartError } = await supabase
    .from("positions")
    .select("*")
    .eq("org_id", orgId);

  if (chartError) throw new Error(`Failed to fetch org chart: ${chartError.message}`);

  // Fetch team capacity
  const { data: capacity, error: capacityError } = await supabase
    .from("user_capacity")
    .select("*")
    .eq("org_id", orgId);

  if (capacityError) throw new Error(`Failed to fetch capacity: ${capacityError.message}`);

  // Build capacity map
  const capacityMap = (capacity || []).reduce(
    (acc: any, row: any) => {
      acc[row.user_id] = {
        user_id: row.user_id,
        max_task_count: row.max_task_count,
        current_task_count: row.current_task_count,
        capacity_used_percent: (row.current_task_count / row.max_task_count) * 100,
      };
      return acc;
    },
    {}
  );

  return {
    chart: chart || [],
    capacity: capacityMap,
  };
}

/**
 * Handle agent decision and produce results
 */
async function handleDecision(
  agentOutput: any,
  jobData: HierarchicalQueueJob,
  supabase: any,
  orgContext: any
): Promise<any> {
  const { action } = agentOutput;

  switch (action) {
    case "decompose": {
      return handleDecomposition(agentOutput, jobData, supabase, orgContext);
    }
    case "delegate": {
      return handleDelegation(agentOutput, jobData, supabase, orgContext);
    }
    case "execute": {
      return handleExecution(agentOutput, jobData, supabase);
    }
    case "escalate": {
      return handleEscalation(agentOutput, jobData, supabase, orgContext);
    }
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

/**
 * Handle decomposition: create subtasks
 */
async function handleDecomposition(
  agentOutput: any,
  jobData: HierarchicalQueueJob,
  supabase: any,
  orgContext: any
): Promise<DecompositionResult> {
  const { subtasks, reasoning, confidence } = agentOutput;

  console.debug(`[HIERARCHICAL] Decomposing into ${subtasks.length} subtasks`);

  // Create subtasks in DB
  const createdSubtasks = [];
  for (const subtask of subtasks) {
    const { data, error } = await supabase
      .from("tasks")
      .insert({
        org_id: jobData.org_id,
        goal_id: jobData.task.goal_id,
        parent_task_id: jobData.task.id,
        title: subtask.title,
        description: subtask.description,
        success_criteria: subtask.success_criteria,
        priority: subtask.priority || "medium",
        estimated_hours: subtask.estimated_effort_hours,
        depth: jobData.task.depth + 1,
        target_position_slug: subtask.target_position_slug,
        depends_on_task_id: subtask.depends_on_index >= 0 ? null : null, // TODO: resolve from created tasks
        status: "pending",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select();

    if (error) {
      throw new Error(`Failed to create subtask: ${error.message}`);
    }
    createdSubtasks.push(data[0]);
  }

  // Mark parent as decomposed
  await supabase
    .from("tasks")
    .update({
      status: "decomposed",
      decomposed_subtasks: createdSubtasks.length,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobData.task.id);

  return {
    subtasks,
    reasoning,
    confidence,
    total_eff_hours: subtasks.reduce((sum: number, s: any) => sum + (s.estimated_eff_hours || 0), 0),
  } as any;
}

/**
 * Handle delegation: route to subordinate
 */
async function handleDelegation(
  agentOutput: any,
  jobData: HierarchicalQueueJob,
  supabase: any,
  orgContext: any
): Promise<DelegationResult> {
  const { target_position_slug, reasoning, confidence, notes } = agentOutput;

  // Find best person for this position type
  const targetPosition = orgContext.chart.find(
    (p: Position) => p.name?.toLowerCase() === target_position_slug.toLowerCase()
  );

  if (!targetPosition) {
    throw new Error(`No position found for slug: ${target_position_slug}`);
  }

  console.debug(`[HIERARCHICAL] Delegating to position: ${targetPosition.name}`);

  // Find user currently in this position
  const { data: userInPosition } = await supabase
    .from("user_positions")
    .select("user_id")
    .eq("position_id", targetPosition.id)
    .single();

  if (!userInPosition) {
    throw new Error(`No user assigned to position: ${targetPosition.name}`);
  }

  // Update task assignment
  await supabase
    .from("tasks")
    .update({
      assigned_to_user_id: userInPosition.user_id,
      assigned_position_id: targetPosition.id,
      delegated_by_position_id: jobData.current_position.id,
      status: "delegated",
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobData.task.id);

  return {
    target_position_slug,
    reasoning,
    confidence,
    notes,
    resolved_user_id: userInPosition.user_id,
  };
}

/**
 * Handle execution: create execution plan
 */
async function handleExecution(
  agentOutput: any,
  jobData: HierarchicalQueueJob,
  supabase: any
): Promise<ExecutionPlan> {
  const { execution_plan, success_criteria_check, evidence_required, reasoning } = agentOutput;

  console.debug(`[HIERARCHICAL] Creating execution plan for task`);

  // Store execution plan metadata
  await supabase
    .from("tasks")
    .update({
      status: "in_execution",
      execution_plan,
      evidence_required: evidence_required || [],
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobData.task.id);

  return {
    plan: execution_plan,
    success_criteria_check,
    evidence_required,
    reasoning,
  };
}

/**
 * Handle escalation: route to superior
 */
async function handleEscalation(
  agentOutput: any,
  jobData: HierarchicalQueueJob,
  supabase: any,
  orgContext: any
): Promise<EscalationDetails> {
  const { escalation_reason, required_position_level, reasoning } = agentOutput;

  // Find superior with required level
  const superior = orgContext.chart.find(
    (p: Position) =>
      p.level >= required_position_level && p.id === jobData.current_position.parent_position_id
  );

  if (!superior) {
    throw new Error(`No position at level ${required_position_level} to escalate to`);
  }

  console.debug(`[HIERARCHICAL] Escalating to position: ${superior.name}`);

  // Mark as escalated
  await supabase
    .from("tasks")
    .update({
      status: "escalated",
      escalated_to_position_id: superior.id,
      escalation_reason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobData.task.id);

  return {
    reason: escalation_reason,
    required_level: required_position_level,
    reasoning,
  };
}

/**
 * Store result in tasks table
 */
async function storeResult(
  supabase: any,
  jobData: HierarchicalQueueJob,
  result: any
): Promise<void> {
  await supabase
    .from("tasks")
    .update({
      hierarchical_result: result,
      last_processed_at: new Date().toISOString(),
    })
    .eq("id", jobData.task.id);
}

/**
 * Create follow-up queue jobs if needed
 */
async function createFollowUpJobs(
  app: FastifyInstance,
  orgId: string,
  position: Position,
  result: any,
  supabase: any,
  orgContext: any
): Promise<void> {
  const queue = (app.redis as any)?.queue;
  if (!queue) {
    app.log.warn(`[HIERARCHICAL] Redis queue not available, skipping follow-up jobs`);
    return;
  }

  // If delegated, create job for target user
  if (result.resolved_user_id) {
    await queue.add(
      "hierarchical-process",
      {
        org_id: orgId,
        position_id: result.target_position_slug,
        // ... job data
      },
      { delay: 1000 }
    );
  }

  // If decomposed, create jobs for subtasks
  // TODO: iterate created subtasks and enqueue
}

export default createHierarchicalWorker;
