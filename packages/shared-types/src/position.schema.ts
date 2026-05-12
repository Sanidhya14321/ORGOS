import { z } from "zod";

export const PositionLevelSchema = z.number().int().min(0).max(999);
export const VisibilityScopeSchema = z.enum(["org", "branch", "department", "subtree", "self"]);
export const AssignmentStatusSchema = z.enum(["vacant", "invited", "active", "inactive"]);
export const ActivationStateSchema = z.enum(["pending", "activated", "suspended", "revoked"]);

export const OrgBranchSchema = z.object({
  id: z.string().uuid(),
  org_id: z.string().uuid(),
  name: z.string().min(1).max(200),
  code: z.string().min(1).max(80),
  city: z.string().max(120).nullable().optional(),
  country: z.string().max(120).nullable().optional(),
  timezone: z.string().max(80).nullable().optional(),
  is_headquarters: z.boolean().default(false),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional()
});

export const PositionSchema = z.object({
  id: z.string().uuid(),
  org_id: z.string().uuid(),
  branch_id: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(200),
  department: z.string().max(120).nullable().optional(),
  level: PositionLevelSchema,
  power_level: z.number().int().min(0).max(100).default(50),
  reports_to_position_id: z.string().uuid().nullable().optional(),
  visibility_scope: VisibilityScopeSchema.default("org"),
  seat_count: z.number().int().positive().default(1),
  max_concurrent_tasks: z.number().int().positive().default(10),
  compensation_band: z.record(z.any()).optional(),
  metadata: z.record(z.any()).optional(),
  is_custom: z.boolean().default(false),
  confirmed: z.boolean().default(false),
  permissions: z.array(z.string()).optional(),
  filled: z.boolean().optional(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional()
});

export const PositionAssignmentSchema = z.object({
  id: z.string().uuid(),
  org_id: z.string().uuid(),
  position_id: z.string().uuid(),
  user_id: z.string().uuid().nullable().optional(),
  branch_id: z.string().uuid().nullable().optional(),
  seat_label: z.string().max(120).nullable().optional(),
  assignment_status: AssignmentStatusSchema.default("vacant"),
  activation_state: ActivationStateSchema.default("pending"),
  invite_email: z.string().email().nullable().optional(),
  invited_by: z.string().uuid().nullable().optional(),
  invited_at: z.string().datetime().nullable().optional(),
  activated_at: z.string().datetime().nullable().optional(),
  deactivated_at: z.string().datetime().nullable().optional(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional()
});

export const LegacyPositionSchema = PositionSchema;

export type OrgBranch = z.infer<typeof OrgBranchSchema>;
export type Position = z.infer<typeof PositionSchema>;
export type PositionAssignment = z.infer<typeof PositionAssignmentSchema>;
export type LegacyPosition = z.infer<typeof LegacyPositionSchema>;
