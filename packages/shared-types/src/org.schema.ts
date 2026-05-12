import { z } from "zod";
import { OrgStructureKindSchema } from "./org-structure.schema.js";
import { OrgBranchSchema } from "./position.schema.js";

/**
 * Legacy Org Schema - DEPRECATED
 * Kept for backward compatibility
 */
export const OrgSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  domain: z.string().min(1).nullable().optional(),
  created_by: z.string().uuid().nullable().optional(),
  created_at: z.string().datetime().optional()
});

export const OrgSearchResultSchema = OrgSchema.pick({
  id: true,
  name: true,
  domain: true
});

/**
 * Current organization payloads are a composition of the `orgs` row and
 * optional org-setting fields surfaced by onboarding/settings endpoints.
 */
export const OrganizationSchema = OrgSchema.extend({
  industry: z.string().optional(),
  company_size: z.string().optional(),
  org_structure: OrgStructureKindSchema.optional(),
  branch_count: z.number().int().positive().optional(),
  branches: z.array(OrgBranchSchema).optional(),
  updated_at: z.string().datetime().optional()
});

export type Org = z.infer<typeof OrgSchema>;
export type OrgSearchResult = z.infer<typeof OrgSearchResultSchema>;
export type Organization = z.infer<typeof OrganizationSchema>;
