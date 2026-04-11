import { z } from "zod";

export const UserRoleSchema = z.enum(["ceo", "cfo", "manager", "worker"]);

export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  full_name: z.string().min(1),
  role: UserRoleSchema,
  org_id: z.string().uuid().nullable().optional(),
  position_id: z.string().uuid().nullable().optional(),
  reports_to: z.string().uuid().nullable().optional(),
  status: z.enum(["pending", "active", "rejected"]).optional(),
  department: z.string().optional(),
  skills: z.array(z.string()).optional(),
  current_load: z.number().int().nonnegative().optional(),
  email_verified: z.boolean().optional(),
  agent_enabled: z.boolean()
});

export type User = z.infer<typeof UserSchema>;
