import { z } from "zod";
import type { Task } from "@orgos/shared-types";
import { type Position, type UserCapacity, type OrgStructureKind } from "@orgos/shared-types";
import { callLLM } from "../llm/router.js";
import type { LLMMessage } from "../llm/provider.js";

/**
 * HierarchicalAgent: Universal agent that handles decomposition at ANY level of the org
 * 
 * Instead of having CEO → Manager → Worker agents, we have ONE agent that decides:
 * - Should I decompose this task for my subordinates?
 * - Should I delegate this task to a subordinate?
 * - Should I execute this task myself?
 * 
 * This enables true N-tier organizations with unlimited depth.
 */

/**
 * Decision the hierarchical agent makes
 */
export const HierarchicalDecisionSchema = z.enum([
  "decompose",    // Break into subtasks for subordinates
  "delegate",     // Route to a specific subordinate
  "execute",      // Handle at this level
  "escalate"      // Route to superior
]);

/**
 * Agent output when decomposing
 */
export const DecomposeOutputSchema = z.object({
  action: z.literal("decompose"),
  subtasks: z.array(z.object({
    title: z.string(),
    description: z.string().optional(),
    success_criteria: z.string(),
    target_position_slug: z.string(),      // Route to position, AI will find best person
    estimated_effort_hours: z.number().optional(),
    priority: z.enum(["low", "medium", "high", "critical"]).optional(),
    depends_on_index: z.number().int().min(-1).optional(), // -1 = none
  })).max(10),
  reasoning: z.string(),
  confidence: z.number().min(0).max(1),
});

/**
 * Agent output when delegating
 */
export const DelegateOutputSchema = z.object({
  action: z.literal("delegate"),
  target_position_slug: z.string(),  // Route to this position type (agent finds best person)
  reasoning: z.string(),
  confidence: z.number().min(0).max(1),
  notes: z.string().optional(),
});

/**
 * Agent output when executing
 */
export const ExecuteOutputSchema = z.object({
  action: z.literal("execute"),
  execution_plan: z.string(),
  success_criteria_check: z.string(),
  evidence_required: z.array(z.string()).optional(),
  reasoning: z.string(),
});

/**
 * Agent output when escalating
 */
export const EscalateOutputSchema = z.object({
  action: z.literal("escalate"),
  escalation_reason: z.string(),
  required_position_level: z.number().int().min(0),
  reasoning: z.string(),
});

export const HierarchicalAgentOutputSchema = z.discriminatedUnion("action", [
  DecomposeOutputSchema,
  DelegateOutputSchema,
  ExecuteOutputSchema,
  EscalateOutputSchema,
]);

/**
 * Input to hierarchical agent
 */
export interface HierarchicalAgentInput {
  // Task context
  task: Task;
  deadline: string;
  
  // Org context
  current_position: Position;           // Position making the decision
  org_chart: Position[];                // Full org structure for finding candidates
  // Organization structure kind — influences routing rules and recommendations
  org_structure?: OrgStructureKind;
  
  // Capacity info
  team_capacity: Record<string, UserCapacity>; // user_id → capacity
  
  // Historical context
  parent_task?: Task;                   // Task that created this one
  sibling_tasks?: Task[];               // Other subtasks at same level
}

export type HierarchicalAgentOutput = z.infer<typeof HierarchicalAgentOutputSchema>;

/**
 * System prompt for hierarchical agent
 */
const HIERARCHICAL_AGENT_SYSTEM_PROMPT = `You are a hierarchical work decomposition agent for an organization. Your role is to decide how to handle any task at any level of the organizational hierarchy.

Given a task and your current position in the org, you must decide:

1. **DECOMPOSE**: Break this task into 2-6 subtasks and route each to appropriate positions
   - Use when the task is complex and needs parallelization
   - Assign subtasks to specific position types (not people - the system finds best person)
   - Consider team capacity when decomposing
   - Create success criteria for each subtask
   - Maximum 10 subtasks per decomposition

2. **DELEGATE**: Route this entire task to a subordinate position
    ADAPT TO ORGANIZATIONAL MODEL:
    - The organization may follow different structural models (hierarchical, functional, flat, divisional, matrix, team, network, process, circular, line).
    - If the 'org_structure' provided in input is not "hierarchical", adapt recommendations accordingly:
      - 'functional': prefer routing to technical specialists within the function; avoid cross-functional delegation unless necessary.
      - 'flat': prefer direct delegation to skilled individuals; avoid multi-level decomposition.
      - 'divisional': scope decomposition within division boundaries; prefer divisional positions for execution.
      - 'matrix': consider dual reporting; when delegating, note both functional and project owners.
      - 'team': prefer assigning to cross-functional teams or squads rather than single positions.
      - 'network': prefer external partners or vendors for tasks marked as outsourced; flag if internal capacity is insufficient.
      - 'process': follow the process flow — handoffs should respect the process sequence.
      - 'circular': leaders are facilitators; prefer collaborative decomposition and shared ownership.
      - 'line': strictly vertical routing — escalate for anything outside the direct chain.

   - Use when you're too senior to execute this task yourself
   - Or when a specific subordinate has better skills/capacity
   - Provide reasoning for the delegation
   - Include confidence score (0-1)

3. **EXECUTE**: Handle this task at your current level
   - Use when the task is appropriate for your role
   - Create a clear execution plan
   - Define evidence requirements
   - Break down success criteria

4. **ESCALATE**: Route to your superior
   - Use when task requires higher authority
   - Or when it's beyond your max_task_depth
   - Provide clear escalation reason

DECISION RULES:
- Respect org hierarchy: Can only delegate downward, escalate upward
- Don't decompose if you're already at max depth (task.depth >= position.max_task_depth)
- Consider deadline: Tight deadlines may require delegation instead of decomposition
- Factor in team capacity: Don't overload anyone
- Task complexity vs Team capability: Match task difficulty to position levels

POSITION HIERARCHY:
- Level 0: CEO (can approve all, delegate to anyone)
- Level 1: VPs (can decompose, delegate to directors/managers/ICs)
- Level 2: Directors (can decompose, delegate to managers/ICs)
- Level 3+: Managers/ICs (limited decomposition, mostly execute)

Output your decision as JSON matching the HierarchicalAgentOutput schema.`;

/**
 * Main hierarchical agent function
 */
export async function hierarchicalAgent(
  input: HierarchicalAgentInput
): Promise<HierarchicalAgentOutput> {
  const { task, current_position, org_chart, team_capacity } = input;

  // Build org chart context for the LLM (includes structure kind if provided)
  const orgChartContext = buildOrgChartContext(current_position, org_chart, input.org_structure);

  // Build team capacity context
  const capacityContext = buildCapacityContext(team_capacity);

  // Build task context
  const taskContext = buildTaskContext(task, input.parent_task, input.sibling_tasks);

  // Build LLM messages
  const messages: LLMMessage[] = [
    {
      role: "system",
      content: `${HIERARCHICAL_AGENT_SYSTEM_PROMPT}\n\nOrg Structure: ${input.org_structure ?? 'hierarchical'}\n\nOrg Chart:\n${orgChartContext}\n\nTeam Capacity:\n${capacityContext}`,
    },
    {
      role: "user",
      content: taskContext,
    },
  ];

  // Call LLM with JSON mode
  const llmResponse = await callLLM(messages);
  const llmResult = typeof llmResponse === "string" ? llmResponse : llmResponse.content;

  // Parse JSON response from the LLM content
  const jsonMatch = typeof llmResult === "string" ? llmResult.match(/\{[\s\S]*\}/) : null;
  if (!jsonMatch || !jsonMatch[0]) {
    const preview = typeof llmResult === "string" ? llmResult.slice(0, 100) : "[non-string LLM response]";
    throw new Error(`Invalid LLM response - no JSON found: ${preview}`);
  }

  const parsed = HierarchicalAgentOutputSchema.parse(JSON.parse(jsonMatch[0]));

  // Apply business logic validation
  validateDecision(parsed, input);

  return parsed;
}

/**
 * Helper: Build org chart context string
 */
function buildOrgChartContext(position: Position, orgChart: Position[], orgStructure?: string): string {
  const lines: string[] = [];
  lines.push(`Your Position: ${position.name} (Level ${position.level})`);
  if (orgStructure) {
    lines.push(`Org Model: ${orgStructure}`);
  }
  lines.push(`Your Powers:`);
  lines.push(`  - Can delegate: ${position.can_delegate}`);
  lines.push(`  - Max task depth: ${position.max_task_depth}`);
  lines.push(`  - Max direct reports: ${position.max_direct_reports}`);
  lines.push("");

  // Find direct reports
  const directReports = orgChart.filter((p) => p.parent_position_id === position.id);
  if (directReports.length > 0) {
    lines.push("Your Direct Reports:");
    directReports.forEach((p) => {
      // In matrix or functional models, list function or project if available
      const pa = p as any;
      const extra = (pa.function || pa.project || pa.slug) ? ` [${pa.function ?? pa.project ?? pa.slug}]` : "";
      lines.push(`  - ${p.name} (Level ${p.level}, Power: ${p.power_level})${extra}`);
    });
  }

  // Find superior
  if (position.parent_position_id) {
    const superior = orgChart.find((p) => p.id === position.parent_position_id);
    if (superior) {
      lines.push("");
      lines.push(`Your Superior: ${superior.name} (Level ${superior.level})`);
    }
  } else if (orgStructure === 'flat') {
    lines.push("");
    lines.push(`Note: Organization appears to be flat — favor direct assignments to individuals.`);
  }

  return lines.join("\n");
}

/**
 * Helper: Build team capacity context
 */
function buildCapacityContext(capacity: Record<string, UserCapacity>): string {
  const lines: string[] = ["Team Capacity:"];
  Object.entries(capacity).forEach(([userId, cap]) => {
    const percentUsed = Math.round(cap.capacity_used_percent);
    const available = Math.max(0, cap.max_task_count - cap.current_task_count);
    lines.push(`  - User ${userId.slice(0, 8)}: ${percentUsed}% used (${available} slots free)`);
  });
  return lines.join("\n");
}

/**
 * Helper: Build task context
 */
function buildTaskContext(
  task: Task,
  parentTask: Task | undefined,
  siblingTasks: Task[] | undefined
): string {
  const lines: string[] = [];
  lines.push("TASK TO PROCESS:");
  lines.push(`Title: ${task.title}`);
  lines.push(`Description: ${task.description || "N/A"}`);
  lines.push(`Success Criteria: ${task.success_criteria}`);
  lines.push(`Depth: ${task.depth}`);
  lines.push(`Priority: ${task.priority || "medium"}`);
  lines.push(`Deadline: ${task.deadline || "N/A"}`);
  lines.push(`Required Skills: ${task.required_skills?.join(", ") || "N/A"}`);

  if (parentTask) {
    lines.push("");
    lines.push("Parent Task:");
    lines.push(`  - ${parentTask.title}`);
  }

  if (siblingTasks && siblingTasks.length > 0) {
    lines.push("");
    lines.push(`Sibling Tasks (${siblingTasks.length}):`);
    siblingTasks.forEach((t) => {
      lines.push(`  - ${t.title} (${t.status})`);
    });
  }

  lines.push("");
  lines.push("What should you do with this task?");

  return lines.join("\n");
}

/**
 * Validate decision against business rules
 */
function validateDecision(decision: HierarchicalAgentOutput, input: HierarchicalAgentInput): void {
  const { task, current_position } = input;

  // Rule 1: Can't delegate if no direct reports
  if (decision.action === "delegate") {
    const subordinates = input.org_chart.filter(
      (p) => p.parent_position_id === current_position.id
    );
    if (subordinates.length === 0) {
      throw new Error("Cannot delegate: no direct reports");
    }
  }

  // Rule 2: Can't decompose beyond max depth
  if (decision.action === "decompose") {
    if (task.depth >= current_position.max_task_depth) {
      throw new Error(
        `Cannot decompose: task at depth ${task.depth}, max allowed is ${current_position.max_task_depth}`
      );
    }
  }

  // Rule 3: Can't escalate if no superior
  if (decision.action === "escalate") {
    if (!current_position.parent_position_id) {
      throw new Error("Cannot escalate: already at top level");
    }
  }
}
