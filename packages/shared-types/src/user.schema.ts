import { z } from "zod";

export const UserRoleSchema = z.enum(["ceo", "cfo", "manager", "worker"]);

export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  full_name: z.string().min(1),
  role: UserRoleSchema,
  department: z.string().optional(),
  skills: z.array(z.string()).optional(),
  agent_enabled: z.boolean()
});

export type User = z.infer<typeof UserSchema>;
