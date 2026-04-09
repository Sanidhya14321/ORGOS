import { z } from "zod";

export const AssignedRoleSchema = z.enum(["ceo", "cfo", "manager", "worker"]);
export const TaskStatusSchema = z.enum([
  "pending",
  "in_progress",
  "blocked",
  "completed",
  "cancelled"
]);

export const TaskSchema = z.object({
  id: z.string().uuid(),
  goal_id: z.string().uuid(),
  parent_id: z.string().uuid().nullable().optional(),
  depth: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  title: z.string().min(1),
  description: z.string().optional(),
  success_criteria: z.string().min(1),
  required_skills: z.array(z.string()).optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  assigned_role: AssignedRoleSchema,
  is_agent_task: z.boolean(),
  status: TaskStatusSchema,
  deadline: z.string().datetime().optional()
});

export type Task = z.infer<typeof TaskSchema>;
