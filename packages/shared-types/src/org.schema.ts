import { z } from "zod";

/**
 * Legacy Org Schema - DEPRECATED
 * Kept for backward compatibility
 */
export const OrgSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  domain: z.string().min(1).optional(),
  created_by: z.string().uuid().nullable().optional(),
  created_at: z.string().datetime().optional()
});

export const OrgSearchResultSchema = OrgSchema.pick({
  id: true,
  name: true,
  domain: true
});

/**
 * Enhanced Organization Schema with Hierarchy Settings
 */
export const OrganizationSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  domain: z.string().url().optional(),
  description: z.string().max(500).optional(),
  logo_url: z.string().url().optional(),
  
  // Hierarchy settings
  max_hierarchy_depth: z.number().int().min(1).max(20).default(6),
  allow_multi_position: z.boolean().default(true),
  allow_skip_level_delegation: z.boolean().default(false),
  
  // Metadata
  created_by: z.string().uuid().nullable().optional(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});

export type Org = z.infer<typeof OrgSchema>;
export type OrgSearchResult = z.infer<typeof OrgSearchResultSchema>;
export type Organization = z.infer<typeof OrganizationSchema>;
