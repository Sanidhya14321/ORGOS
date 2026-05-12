import type { FastifyInstance } from "fastify";
import { canAccessTaskWithHierarchy, getHierarchyScope } from "./hierarchyScope.js";

export type TaskScopeReason = "ok" | "forbidden" | "not_found" | "unavailable";

type ScopedTask = {
  id: string;
  org_id?: string | null;
  goal_id?: string | null;
  parent_id?: string | null;
  assigned_to?: string | null;
  owner_id?: string | null;
  assignees?: unknown;
  watchers?: unknown;
  report_id?: string | null;
};

function isSchemaCacheUnavailable(error: { code?: string } | null | undefined): boolean {
  return error?.code === "PGRST205" || error?.code === "PGRST204";
}

export async function getTaskWithScope(
  fastify: FastifyInstance,
  taskId: string,
  userId: string,
  userRole: string | null
): Promise<{ task: ScopedTask | null; reason: TaskScopeReason }> {
  const { data: task, error } = await fastify.supabaseService
    .from("tasks")
    .select("*")
    .eq("id", taskId)
    .maybeSingle();

  if (error) {
    return {
      task: null,
      reason: isSchemaCacheUnavailable(error) ? "unavailable" : "not_found"
    };
  }

  if (!task) {
    return { task: null, reason: "not_found" };
  }

  const scope = await getHierarchyScope(fastify, userId);
  if (!scope) {
    return { task: null, reason: "forbidden" };
  }

  if (!canAccessTaskWithHierarchy(task as ScopedTask, scope)) {
    return { task: null, reason: "forbidden" };
  }

  return { task: task as ScopedTask, reason: "ok" };
}
