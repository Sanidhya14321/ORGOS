import { z } from "zod";
import { OrgStructureKindSchema } from "./org-structure.schema.js";
import { CredentialIssueModeSchema } from "./credential.schema.js";

/**
 * Org Structure Suggestion
 * Recommends hierarchy shape based on company size, position count, departments
 */

export const OrgStructureSuggestionSchema = z.object({
  id: z.string().uuid(),
  org_id: z.string().uuid(),
  
  // Input that drove the suggestion
  company_size: z.enum(["startup", "mid", "enterprise"]),
  position_count: z.number().int().min(1),
  branch_count: z.number().int().min(1),
  department_count: z.number().int().min(1),
  
  // Suggestion
  suggested_kind: OrgStructureKindSchema,
  reason: z.string(), // e.g., "For a startup with 8 positions, flat hierarchy recommended for faster decision-making"
  confidence: z.number().min(0).max(1), // 0-1 confidence score
  
  // Position assignment hints
  position_assignments: z.array(
    z.object({
      position_title: z.string(),
      suggested_level: z.number().int().min(0).max(5),
      suggested_reports_to: z.string().nullable(), // Position title it should report to
      rationale: z.string().optional(),
    })
  ),
  
  // Approval status
  ceo_reviewed: z.boolean().default(false),
  ceo_approved: z.boolean().default(false),
  ceo_approved_at: z.string().datetime().nullable().optional(),
  applied: z.boolean().default(false),
  applied_at: z.string().datetime().nullable().optional(),
  
  // Metadata
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type OrgStructureSuggestion = z.infer<typeof OrgStructureSuggestionSchema>;

/**
 * Org Structure Suggestion Request (from CEO during onboarding)
 */
export const OrgStructureSuggestionRequestSchema = z.object({
  org_id: z.string().uuid(),
  company_size: z.enum(["startup", "mid", "enterprise"]),
  position_count: z.number().int().min(1),
  branch_count: z.number().int().min(1),
  department_count: z.number().int().min(1),
  departments: z.array(z.string()).optional(),
  branches: z.array(z.string()).optional(),
  include_position_assignment_hints: z.boolean().default(true),
});

export const OnboardingBranchInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  code: z.string().trim().min(1).max(80),
  city: z.string().trim().max(120).optional(),
  country: z.string().trim().max(120).optional(),
  timezone: z.string().trim().max(80).optional(),
  is_headquarters: z.boolean().default(false)
});

export const OnboardingPositionInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  department: z.string().trim().max(120).optional(),
  branch_code: z.string().trim().max(80).optional(),
  level: z.number().int().min(0).max(999),
  power_level: z.number().int().min(0).max(100).optional(),
  reports_to_title: z.string().trim().max(200).optional(),
  visibility_scope: z.enum(["org", "branch", "department", "subtree", "self"]).default("subtree"),
  email_prefix: z.string().trim().min(1).max(120),
  invite_email: z.string().email().optional(),
  issue_mode: CredentialIssueModeSchema.default("hybrid"),
  seat_label: z.string().trim().max(120).optional(),
  compensation_band: z.record(z.any()).optional(),
  max_concurrent_tasks: z.number().int().positive().max(1000).optional()
});

export const OnboardingPositionImportSchema = z.object({
  org_id: z.string().uuid(),
  import_source: z.enum(["manual", "file", "notion"]).default("manual"),
  branches: z.array(OnboardingBranchInputSchema).default([]),
  positions: z.array(OnboardingPositionInputSchema).min(1).max(500)
});

export const OnboardingPositionParsePreviewRequestSchema = z.object({
  org_id: z.string().uuid(),
  file_name: z.string().trim().min(1).max(255),
  file_content_base64: z.string().min(1),
  mime_type: z.string().trim().min(1).optional()
});

export const OnboardingPositionParsePreviewResponseSchema = z.object({
  import_source: z.literal("file"),
  source_format: z.enum(["pdf", "docx", "xlsx", "csv", "txt", "md", "unknown"]),
  branches: z.array(OnboardingBranchInputSchema),
  positions: z.array(OnboardingPositionInputSchema),
  warnings: z.array(z.string()),
  detected_headers: z.array(z.string()).default([]),
  stats: z.object({
    branch_count: z.number().int().nonnegative(),
    position_count: z.number().int().nonnegative()
  })
});

/**
 * Apply Suggestion Request (CEO confirms suggested structure)
 */
export const ApplyStructureSuggestionSchema = z.object({
  org_id: z.string().uuid(),
  suggestion_id: z.string().uuid(),
  approved_assignments: z.array(
    z.object({
      position_title: z.string(),
      approved_level: z.number().int().min(0).max(5),
      approved_reports_to: z.string().nullable(),
    })
  ).optional(), // If not provided, use defaults from suggestion
});
