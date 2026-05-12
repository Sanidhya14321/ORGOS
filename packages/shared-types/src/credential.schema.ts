import { z } from "zod";

export const CredentialIssueModeSchema = z.enum(["invite", "temporary_password", "hybrid"]);
export const CredentialActivationStatusSchema = z.enum(["pending", "activated", "revoked", "expired"]);

/**
 * Position Credentials Schema
 * Stores login credentials and activation metadata for positions.
 */
export const PositionCredentialSchema = z.object({
  id: z.string().uuid(),
  org_id: z.string().uuid(),
  position_id: z.string().uuid(),
  email: z.string().email(), // e.g., "engineer-1@company.domain"
  password_hash: z.string().min(1), // bcrypt hash
  plaintext_password: z.string().nullable().optional(), // Null = already viewed, not stored in DB
  invite_token: z.string().nullable().optional(),
  invite_code: z.string().nullable().optional(),
  invitation_url: z.string().url().nullable().optional(),
  invite_email: z.string().email().nullable().optional(),
  issued_mode: CredentialIssueModeSchema.default("hybrid"),
  activation_status: CredentialActivationStatusSchema.default("pending"),
  invite_expires_at: z.string().datetime().nullable().optional(),
  activated_at: z.string().datetime().nullable().optional(),
  auth_user_id: z.string().uuid().nullable().optional(),
  created_at: z.string().datetime(),
  reset_at: z.string().datetime().nullable().optional(),
  first_login_at: z.string().datetime().nullable().optional(),
  force_password_change: z.boolean().default(true), // Force change on first login
  updated_at: z.string().datetime().optional()
});

export type PositionCredential = z.infer<typeof PositionCredentialSchema>;

/**
 * Credential Generation Request (internal use)
 */
export const GenerateCredentialSchema = z.object({
  position_id: z.string().uuid(),
  email: z.string().email(),
  invite_email: z.string().email().optional(),
  issue_mode: CredentialIssueModeSchema.default("hybrid")
});

/**
 * Credential Display Response (to CEO only, with plaintext)
 */
export const CredentialDisplaySchema = z.object({
  position_id: z.string().uuid(),
  position_title: z.string(),
  email: z.string().email(),
  invite_code: z.string().nullable().optional(),
  invitation_url: z.string().url().nullable().optional(),
  activation_status: CredentialActivationStatusSchema.default("pending"),
  issued_mode: CredentialIssueModeSchema.default("hybrid"),
  plaintext_password: z.string().nullable().optional(), // Only returned on create/reset flows
  force_password_change: z.boolean().default(true),
  created_at: z.string().datetime(),
  invite_expires_at: z.string().datetime().nullable().optional()
});

export type CredentialDisplay = z.infer<typeof CredentialDisplaySchema>;

/**
 * Bulk Credential Export (for CEO to download as CSV)
 */
export const BulkCredentialExportSchema = z.object({
  org_id: z.string().uuid(),
  company_name: z.string(),
  positions: z.array(
    z.object({
      position_title: z.string(),
      department: z.string().optional(),
      email: z.string().email(),
      invite_code: z.string().nullable().optional(),
      invitation_url: z.string().url().nullable().optional(),
      activation_status: CredentialActivationStatusSchema.default("pending"),
      issued_mode: CredentialIssueModeSchema.default("hybrid"),
      level: z.number().int(),
      force_password_change: z.boolean().default(true),
    })
  ),
  exported_at: z.string().datetime(),
  expires_at: z.string().datetime(), // Passwords should be changed before this date
});

export type BulkCredentialExport = z.infer<typeof BulkCredentialExportSchema>;
