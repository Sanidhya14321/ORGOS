import { z } from "zod";

const IsoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "deadline must be an ISO date (YYYY-MM-DD)");

export const GoalStatusSchema = z.enum(["active", "paused", "completed", "cancelled"]);
export const GoalPrioritySchema = z.enum(["low", "medium", "high", "critical"]);

export const GoalSchema = z.object({
  id: z.string().uuid(),
  org_id: z.string().uuid(),                           // NEW: Organization
  
  title: z.string().min(3).max(200),
  description: z.string().optional(),
  raw_input: z.string(),
  
  status: GoalStatusSchema,
  priority: GoalPrioritySchema,
  
  // Position hierarchy
  created_by_position_id: z.string().uuid().optional(), // NEW: Position that created this goal
  assigned_position_id: z.string().uuid().optional(),   // NEW: Position responsible for delivery
  
  kpi: z.string().optional(),
  deadline: IsoDateSchema.optional(),
  
  simulation: z.boolean().default(false),
  
  // Metadata
  created_by: z.string().uuid().nullable().optional(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional()
});

export type Goal = z.infer<typeof GoalSchema>;
