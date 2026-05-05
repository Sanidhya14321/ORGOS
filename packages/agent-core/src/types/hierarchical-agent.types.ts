import type { Task, Position, Goal } from "@orgos/shared-types";

/**
 * User capacity tracking
 */
export interface UserCapacity {
  user_id: string;
  max_task_count: number;
  current_task_count: number;
  capacity_used_percent: number;
  busy_until?: string; // ISO 8601
}

/**
 * Org context passed to the agent
 */
export interface HierarchicalOrgContext {
  org_id: string;
  org_name: string;
  chart: Position[];
  capacity: Record<string, UserCapacity>;
}

/**
 * Decision output from the agent
 */
export interface DecisionOutput {
  decision: "decompose" | "delegate" | "execute" | "escalate";
  confidence: number;
  reasoning: string;
  metadata?: Record<string, unknown>;
}

/**
 * Context passed to hierarchy resolver
 */
export interface HierarchyResolverContext {
  position: Position;
  org_chart: Position[];
  task: Task;
}

/**
 * Result of resolving a position slug to an actual person
 */
export interface ResolvedAssignment {
  position_id: string;
  position_name: string;
  user_id: string;
  user_name: string;
  capacity_available: boolean;
  reason: string;
}

/**
 * Subtask output from decomposition
 */
export interface DecomposedSubtask {
  title: string;
  description?: string;
  success_criteria: string;
  target_position_slug: string;
  estimated_effort_hours?: number;
  priority?: "low" | "medium" | "high" | "critical";
  depends_on_index?: number; // -1 = no dependency
}

/**
 * Full decomposition result
 */
export interface DecompositionResult {
  subtasks: DecomposedSubtask[];
  reasoning: string;
  confidence: number;
  total_effort_hours?: number;
}

/**
 * Delegation result
 */
export interface DelegationResult {
  target_position_slug: string;
  reasoning: string;
  confidence: number;
  notes?: string;
  resolved_user_id?: string; // After resolution
}

/**
 * Execution plan
 */
export interface ExecutionPlan {
  plan: string;
  success_criteria_check: string;
  evidence_required?: string[];
  reasoning: string;
}

/**
 * Escalation details
 */
export interface EscalationDetails {
  reason: string;
  required_level: number;
  reasoning: string;
}

/**
 * Queue job for hierarchical processing
 */
export interface HierarchicalQueueJob {
  id: string;
  org_id: string;
  task: Task;
  goal?: Goal;
  current_position: Position;
  deadline: string;
  parent_task?: Task;
  sibling_tasks?: Task[];
  
  // Result after processing
  decision?: DecisionOutput;
  subtasks?: DecomposedSubtask[];
  delegation_target?: DelegationResult;
  execution_plan?: ExecutionPlan;
  escalation?: EscalationDetails;
  error?: string;
}

/**
 * Queue stats for monitoring
 */
export interface HierarchicalQueueStats {
  total_jobs: number;
  decompositions: number;
  delegations: number;
  executions: number;
  escalations: number;
  errors: number;
  avg_processing_time_ms: number;
}
