import type { SupabaseClient } from "@supabase/supabase-js";

export interface TaskTreeNode {
  task: Record<string, unknown>;
  children: TaskTreeNode[];
}

export async function buildTaskTree(
  supabase: SupabaseClient,
  goalId: string
): Promise<TaskTreeNode[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select("id, goal_id, parent_id, depth, title, description, success_criteria, assigned_to, assigned_role, is_agent_task, status, deadline, created_at")
    .eq("goal_id", goalId)
    .order("depth", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load tasks for goal: ${error.message}`);
  }

  const rows = data ?? [];
  const map = new Map<string, TaskTreeNode>();
  const roots: TaskTreeNode[] = [];

  for (const row of rows) {
    map.set(row.id as string, { task: row as Record<string, unknown>, children: [] });
  }

  for (const row of rows) {
    const node = map.get(row.id as string);
    if (!node) {
      continue;
    }

    const parentId = row.parent_id as string | null;
    if (!parentId) {
      roots.push(node);
      continue;
    }

    const parentNode = map.get(parentId);
    if (parentNode) {
      parentNode.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

export async function updateGoalStatus(
  supabase: SupabaseClient,
  goalId: string,
  status: "active" | "paused" | "completed" | "cancelled"
): Promise<void> {
  const { error: goalError } = await supabase
    .from("goals")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", goalId);

  if (goalError) {
    throw new Error(`Failed to update goal status: ${goalError.message}`);
  }

  const { error: logError } = await supabase.from("agent_logs").insert({
    goal_id: goalId,
    agent_type: "manager_agent",
    action: "execute",
    model: "system",
    input: { status },
    output: { updated: true }
  });

  if (logError) {
    throw new Error(`Failed to write goal status audit log: ${logError.message}`);
  }
}

export async function recomputeGoalRollup(
  supabase: SupabaseClient,
  goalId: string
): Promise<{ status: "active" | "paused" | "completed" | "cancelled"; completionPct: number; totalTasks: number; completedTasks: number }> {
  const { data: tasks, error } = await supabase
    .from("tasks")
    .select("id, status")
    .eq("goal_id", goalId);

  if (error) {
    throw new Error(`Failed to load goal rollup tasks: ${error.message}`);
  }

  const totalTasks = tasks?.length ?? 0;
  const completedTasks = (tasks ?? []).filter((task) => task.status === "completed").length;
  const cancelledTasks = (tasks ?? []).filter((task) => task.status === "cancelled").length;
  const completionPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  let status: "active" | "paused" | "completed" | "cancelled" = "active";
  if (totalTasks > 0 && completedTasks === totalTasks) {
    status = "completed";
  } else if (totalTasks > 0 && cancelledTasks === totalTasks) {
    status = "cancelled";
  }

  const { error: updateError } = await supabase
    .from("goals")
    .update({
      status,
      updated_at: new Date().toISOString()
    })
    .eq("id", goalId);

  if (updateError) {
    throw new Error(`Failed to update goal rollup: ${updateError.message}`);
  }

  return { status, completionPct, totalTasks, completedTasks };
}

export function buildSimulationPreview(input: {
  title: string;
  description?: string;
  priority: "low" | "medium" | "high" | "critical";
  deadline?: string;
}): { goal: Record<string, unknown>; tasks: TaskTreeNode[] } {
  return {
    goal: {
      title: input.title,
      description: input.description ?? null,
      priority: input.priority,
      deadline: input.deadline ?? null,
      simulation: true
    },
    tasks: []
  };
}
