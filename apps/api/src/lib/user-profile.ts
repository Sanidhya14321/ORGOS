import type { FastifyInstance } from "fastify";
import { UserSchema } from "@orgos/shared-types";
import type { User } from "@orgos/shared-types";

type SupabaseAuthUser = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

function normalizeRole(value: unknown): User["role"] {
  return value === "ceo" || value === "cfo" || value === "manager" || value === "worker" ? value : "worker";
}

function normalizeSkills(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const skills = value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());

  return skills.length > 0 ? skills : undefined;
}

function normalizeFullName(value: unknown, email: string): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  const localPart = email.split("@")[0]?.trim();
  return localPart && localPart.length > 0 ? localPart : "ORGOS User";
}

function normalizeDepartment(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const department = value.trim();
  return department.length > 0 ? department : undefined;
}

export function buildUserProfileFromAuthUser(authUser: SupabaseAuthUser): User {
  const metadata = authUser.user_metadata ?? {};
  const email = authUser.email ?? `${authUser.id}@orgos.local`;

  return UserSchema.parse({
    id: authUser.id,
    email,
    full_name: normalizeFullName(metadata.full_name ?? metadata.name, email),
    role: normalizeRole(metadata.role),
    department: normalizeDepartment(metadata.department),
    skills: normalizeSkills(metadata.skills),
    agent_enabled: typeof metadata.agent_enabled === "boolean" ? metadata.agent_enabled : true
  });
}

export async function loadUserProfile(fastify: FastifyInstance, authUser: SupabaseAuthUser): Promise<User> {
  const profileQuery = await fastify.supabaseService
    .from("users")
    .select("id, email, full_name, role, status, org_id, position_id, reports_to, department, skills, open_task_count, agent_enabled")
    .eq("id", authUser.id)
    .maybeSingle();

  if (!profileQuery.error && profileQuery.data) {
    const parsed = UserSchema.safeParse(profileQuery.data);
    if (parsed.success) {
      return parsed.data;
    }

    fastify.log.warn({ issues: parsed.error.flatten() }, "Invalid user profile shape, using auth metadata fallback");
  }

  if (profileQuery.error) {
    fastify.log.warn({ err: profileQuery.error }, "Falling back to auth metadata for user profile");
  }

  return buildUserProfileFromAuthUser(authUser);
}

export async function persistUserProfile(fastify: FastifyInstance, profile: User): Promise<void> {
  const { error } = await fastify.supabaseService.from("users").upsert(profile, { onConflict: "id" });

  if (error) {
    fastify.log.warn({ err: error }, "Failed to persist user profile");
  }
}