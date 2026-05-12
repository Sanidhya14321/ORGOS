import type { FastifyInstance } from "fastify";

export type TaskScopeReason = "ok" | "forbidden" | "not_found" | "unavailable";

type ScopedTask = {
  id: string;
  org_id?: string | null;
  assigned_to?: string | null;
  owner_id?: string | null;
  assignees?: unknown;
  watchers?: unknown;
  report_id?: string | null;
};

function isSchemaCacheUnavailable(error: { code?: string } | null | undefined): boolean {
  return error?.code === "PGRST205" || error?.code === "PGRST204";
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
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

  if (userRole === "ceo" || userRole === "cfo") {
    return { task: task as ScopedTask, reason: "ok" };
  }

  if (userRole === "manager") {
    const { data: manager, error: managerError } = await fastify.supabaseService
      .from("users")
      .select("department, org_id")
      .eq("id", userId)
      .maybeSingle();

    if (managerError) {
      return {
        task: null,
        reason: isSchemaCacheUnavailable(managerError) ? "unavailable" : "forbidden"
      };
    }

    if (!manager?.department || !manager?.org_id) {
      return { task: null, reason: "forbidden" };
    }

    if ((task.org_id as string | null | undefined) && task.org_id !== manager.org_id) {
      return { task: null, reason: "forbidden" };
    }

    if (task.assigned_to === userId) {
      return { task: task as ScopedTask, reason: "ok" };
    }

    const { data: assignee, error: assigneeError } = await fastify.supabaseService
      .from("users")
      .select("department, org_id")
      .eq("id", task.assigned_to)
      .maybeSingle();

    if (assigneeError) {
      return {
        task: null,
        reason: isSchemaCacheUnavailable(assigneeError) ? "unavailable" : "forbidden"
      };
    }

    if (assignee?.department === manager.department && assignee?.org_id === manager.org_id) {
      return { task: task as ScopedTask, reason: "ok" };
    }

    return { task: null, reason: "forbidden" };
  }

  const ownerId = typeof task.owner_id === "string" ? task.owner_id : null;
  const assignees = toStringArray(task.assignees);
  const watchers = toStringArray(task.watchers);

  if (task.assigned_to !== userId && ownerId !== userId && !assignees.includes(userId) && !watchers.includes(userId)) {
    return { task: null, reason: "forbidden" };
  }

  return { task: task as ScopedTask, reason: "ok" };
}
