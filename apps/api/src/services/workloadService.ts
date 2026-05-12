import type { SupabaseClient } from "@supabase/supabase-js";

const OPEN_TASK_STATUSES = ["pending", "routing", "active", "in_progress", "blocked", "rejected"] as const;

export async function syncUserOpenTaskCounts(supabase: SupabaseClient, userIds: Array<string | null | undefined>): Promise<void> {
  const normalizedIds = Array.from(
    new Set(userIds.filter((value): value is string => typeof value === "string" && value.length > 0))
  );

  if (normalizedIds.length === 0) {
    return;
  }

  const tasksResult = await supabase
    .from("tasks")
    .select("assigned_to, status")
    .in("assigned_to", normalizedIds)
    .in("status", [...OPEN_TASK_STATUSES]);

  if (tasksResult.error) {
    throw new Error(`Failed to load workload task counts: ${tasksResult.error.message}`);
  }

  const counts = new Map<string, number>();
  for (const userId of normalizedIds) {
    counts.set(userId, 0);
  }

  for (const row of tasksResult.data ?? []) {
    const assignedTo = typeof row.assigned_to === "string" ? row.assigned_to : null;
    if (!assignedTo || !counts.has(assignedTo)) {
      continue;
    }
    counts.set(assignedTo, (counts.get(assignedTo) ?? 0) + 1);
  }

  for (const userId of normalizedIds) {
    const nextCount = counts.get(userId) ?? 0;
    const updateResult = await supabase
      .from("users")
      .update({
        open_task_count: nextCount,
        current_load: nextCount,
        updated_at: new Date().toISOString()
      })
      .eq("id", userId);

    if (updateResult.error) {
      throw new Error(`Failed to sync workload for ${userId}: ${updateResult.error.message}`);
    }
  }
}
