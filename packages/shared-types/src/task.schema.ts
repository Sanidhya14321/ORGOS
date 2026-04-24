import { z } from "zod";

export const AssignedRoleSchema = z.enum(["ceo", "cfo", "manager", "worker"]);
export const TaskStatusSchema = z.enum([
  "pending",
  "routing",
  "active",
  "in_progress",
  "blocked",
  "rejected",
  "completed",
  "cancelled"
]);

export const TaskSchema = z.object({
  id: z.string().uuid(),
  org_id: z.string().uuid().optional(),
  created_by: z.string().uuid().nullable().optional(),
  owner_id: z.string().uuid().nullable().optional(),
  goal_id: z.string().uuid(),
  parent_id: z.string().uuid().nullable().optional(),
  parent_task_id: z.string().uuid().nullable().optional(),
  depth: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  title: z.string().min(1),
  description: z.string().optional(),
  success_criteria: z.string().min(1),
  required_skills: z.array(z.string()).optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  assignees: z.array(z.string().uuid()).optional(),
  watchers: z.array(z.string().uuid()).optional(),
  depends_on: z.array(z.string().uuid()).optional(),
  assigned_role: AssignedRoleSchema,
  is_agent_task: z.boolean(),
  routing_confirmed: z.boolean().optional(),
  status: TaskStatusSchema,
  deadline: z.string().datetime().optional(),
  recurrence_cron: z.string().nullable().optional(),
  recurrence_enabled: z.boolean().optional(),
  recurrence_timezone: z.string().optional(),
  next_run_at: z.string().datetime().nullable().optional(),
  requires_evidence: z.boolean().optional(),
  completion_approved: z.boolean().optional(),
  completion_approved_by: z.string().uuid().nullable().optional(),
  completion_approved_at: z.string().datetime().nullable().optional(),
  completion_notes: z.string().nullable().optional(),
  blocked_by_count: z.number().int().optional(),
  estimated_effort_hours: z.number().optional(),
  is_overdue: z.boolean().optional(),
  sla_deadline: z.string().datetime().optional(),
  sla_status: z.enum(["on_track", "at_risk", "breached"]).optional(),
  rejection_reason: z.string().optional(),
  suggested_fixes: z.string().optional()
});

export type Task = z.infer<typeof TaskSchema>;
