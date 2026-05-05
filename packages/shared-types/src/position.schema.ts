import { z } from "zod";

/**
 * Legacy Position Schema - DEPRECATED
 * Only 3 levels hardcoded. Kept for backward compatibility during migration.
 */
export const PositionLevelSchema = z.union([z.literal(0), z.literal(1), z.literal(2)]);

export const LegacyPositionSchema = z.object({
  id: z.string().uuid(),
  org_id: z.string().uuid(),
  title: z.string().min(1).max(200),
  level: PositionLevelSchema,
  is_custom: z.boolean().default(false),
  confirmed: z.boolean().default(false),
  created_at: z.string().datetime().optional()
});

/**
 * NEW: Dynamic Position Schema
 * Supports unlimited hierarchy levels with granular permissions
 */
export const PositionSchema = z.object({
  id: z.string().uuid(),
  org_id: z.string().uuid(),
  
  // Identity
  name: z.string().min(1).max(100),              // e.g., "VP Engineering"
  slug: z.string().min(1).max(100),              // e.g., "vp-engineering"
  description: z.string().max(500).optional(),
  
  // Hierarchy
  level: z.number().int().min(0).max(20),        // 0=CEO, 1=VP, 2=Director, etc.
  parent_position_id: z.string().uuid().nullable().optional(), // Direct superior position
  department: z.string().optional(),              // e.g., "engineering", "sales"
  
  // Power & Permissions
  power_level: z.number().int().min(0).max(100), // 0=entry-level IC, 100=CEO
  can_create_goals: z.boolean().default(false),
  can_create_tasks: z.boolean().default(true),
  can_assign_positions: z.boolean().default(false), // Can create new positions
  can_approve_work: z.boolean().default(false),
  can_delegate: z.boolean().default(true),
  can_view_org_structure: z.boolean().default(true),
  
  // Capacity
  max_direct_reports: z.number().int().min(1).default(5),
  max_task_depth: z.number().int().min(0).default(3), // Max depth subtasks can go
  max_concurrent_tasks: z.number().int().min(1).default(10),
  
  // Metadata
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
  archived_at: z.string().datetime().nullable().optional(),
});

/**
 * UserPosition: Maps a user to a position in the organization
 * Supports multiple positions and time-bound assignments
 */
export const UserPositionSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  position_id: z.string().uuid(),
  
  // Temporal
  effective_from: z.string().datetime(),
  effective_to: z.string().datetime().nullable().optional(), // null = ongoing
  
  // Role in this position
  is_primary: z.boolean().default(true),         // Primary position for permissions
  is_acting: z.boolean().default(false),         // Temporary/cover assignment
  
  // Delegation power
  can_delegate_on_behalf: z.boolean().default(false), // Can assign work as if they were the position holder
  
  // Metadata
  assigned_by: z.string().uuid(),
  assigned_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

/**
 * PositionHierarchy: Cached view of org structure (for performance)
 * Denormalized data to avoid N+1 queries when building org chart
 */
export const PositionHierarchySchema = z.object({
  position_id: z.string().uuid(),
  org_id: z.string().uuid(),
  level: z.number().int(),
  path: z.array(z.string().uuid()),              // Lineage from CEO to this position
  depth: z.number().int(),                       // Distance from CEO
  parent_position_id: z.string().uuid().nullable(),
  child_position_ids: z.array(z.string().uuid()),
  total_subordinates: z.number().int(),
  created_at: z.string().datetime(),
});

/**
 * UserCapacity: Track current workload per user
 * Used for smart task assignment
 */
export const UserCapacitySchema = z.object({
  user_id: z.string().uuid(),
  position_id: z.string().uuid(),
  
  current_task_count: z.number().int().min(0),
  max_task_count: z.number().int().min(1),
  
  capacity_used_percent: z.number().min(0).max(100),
  estimated_free_capacity_hours: z.number().min(0),
  
  average_task_completion_hours: z.number().min(0.5),
  success_rate_percent: z.number().min(0).max(100),
  
  last_updated_at: z.string().datetime(),
});

// Export types
export type LegacyPosition = z.infer<typeof LegacyPositionSchema>;
export type Position = z.infer<typeof PositionSchema>;
export type UserPosition = z.infer<typeof UserPositionSchema>;
export type PositionHierarchy = z.infer<typeof PositionHierarchySchema>;
export type UserCapacity = z.infer<typeof UserCapacitySchema>;
