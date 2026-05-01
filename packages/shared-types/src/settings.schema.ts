import { z } from "zod";

export const UserPreferencesSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  theme: z.enum(["dark", "light", "auto"]).default("dark"),
  language: z.enum(["en", "es", "fr", "de"]).default("en"),
  time_format: z.enum(["12h", "24h"]).default("24h"),
  email_notifications: z.boolean().default(true),
  task_assigned: z.boolean().default(true),
  task_updated: z.boolean().default(true),
  sla_breached: z.boolean().default(true),
  interview_scheduled: z.boolean().default(true),
  meeting_digest: z.boolean().default(false),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});

export type UserPreferences = z.infer<typeof UserPreferencesSchema>;

export const UserPreferencesUpdateSchema = z.object({
  theme: z.enum(["dark", "light", "auto"]).optional(),
  language: z.enum(["en", "es", "fr", "de"]).optional(),
  time_format: z.enum(["12h", "24h"]).optional(),
  email_notifications: z.boolean().optional(),
  task_assigned: z.boolean().optional(),
  task_updated: z.boolean().optional(),
  sla_breached: z.boolean().optional(),
  interview_scheduled: z.boolean().optional(),
  meeting_digest: z.boolean().optional(),
});

export type UserPreferencesUpdate = z.infer<typeof UserPreferencesUpdateSchema>;

export const UserApiKeySchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  key_hash: z.string(),
  key_prefix: z.string(), // e.g., "sk_live_abc123..."
  name: z.string().min(1).max(100),
  last_used_at: z.string().datetime().nullable().optional(),
  expires_at: z.string().datetime().nullable().optional(),
  created_at: z.string().datetime().optional(),
  revoked_at: z.string().datetime().nullable().optional(),
});

export type UserApiKey = z.infer<typeof UserApiKeySchema>;

export const UserApiKeyCreateSchema = z.object({
  name: z.string().min(1).max(100),
  expires_at: z.string().datetime().optional(),
});

export type UserApiKeyCreate = z.infer<typeof UserApiKeyCreateSchema>;

export const ChangePasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(8).regex(/[A-Z]/, "Password must contain uppercase").regex(/[a-z]/, "Password must contain lowercase").regex(/[0-9]/, "Password must contain number"),
});

export type ChangePassword = z.infer<typeof ChangePasswordSchema>;
