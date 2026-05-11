import { z } from "zod";

/**
 * Position Credentials Schema
 * Stores login credentials (email + hashed password) for positions
 * Plaintext password shown only once to CEO on creation/reset
 */
export const PositionCredentialSchema = z.object({
  id: z.string().uuid(),
  org_id: z.string().uuid(),
  position_id: z.string().uuid(),
  email: z.string().email(), // e.g., "engineer-1@company.domain"
  password_hash: z.string().min(1), // bcrypt hash
  plaintext_password: z.string().nullable().optional(), // Null = already viewed, not stored in DB
  created_at: z.string().datetime(),
  reset_at: z.string().datetime().nullable().optional(),
  first_login_at: z.string().datetime().nullable().optional(),
  force_password_change: z.boolean().default(true), // Force change on first login
});

export type PositionCredential = z.infer<typeof PositionCredentialSchema>;

/**
 * Credential Generation Request (internal use)
 */
export const GenerateCredentialSchema = z.object({
  position_id: z.string().uuid(),
  email: z.string().email(),
});

/**
 * Credential Display Response (to CEO only, with plaintext)
 */
export const CredentialDisplaySchema = z.object({
  position_id: z.string().uuid(),
  position_title: z.string(),
  email: z.string().email(),
  plaintext_password: z.string(), // Only shown once
  created_at: z.string().datetime(),
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
      plaintext_password: z.string(),
      level: z.number().int(),
    })
  ),
  exported_at: z.string().datetime(),
  expires_at: z.string().datetime(), // Passwords should be changed before this date
});

export type BulkCredentialExport = z.infer<typeof BulkCredentialExportSchema>;
