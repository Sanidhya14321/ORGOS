import type { Task } from "@orgos/shared-types";
import { createSupabaseServiceClient } from "../lib/clients.js";
import { readEnv } from "../config/env.js";
import { emitTaskAssigned } from "./notifier.js";

interface CandidateUser {
  id: string;
  open_task_count: number;
  skills: string[] | null;
}

const env = readEnv();

function hasRequiredSkills(candidate: CandidateUser, requiredSkills: string[]): boolean {
  const candidateSkills = candidate.skills ?? [];
  return requiredSkills.every((skill) => candidateSkills.includes(skill));
}

export async function assignTask(task: Task): Promise<Task> {
  const supabase = createSupabaseServiceClient(env);

  const { data: candidates, error: candidatesError } = await supabase
    .from("users")
    .select("id, open_task_count, skills")
    .eq("role", task.assigned_role)
    .eq("agent_enabled", true)
    .order("open_task_count", { ascending: true });

  if (candidatesError) {
    throw new Error(`Failed to load assignment candidates: ${candidatesError.message}`);
  }

  const candidateList = (candidates ?? []) as CandidateUser[];
  const requiredSkills = task.required_skills ?? [];

  let selected: CandidateUser | null = null;

  if (requiredSkills.length > 0) {
    selected = candidateList.find((candidate) => hasRequiredSkills(candidate, requiredSkills)) ?? null;
  }

  if (!selected && candidateList.length > 0) {
    selected = candidateList[0] ?? null;
  }

  if (!selected) {
    const fallbackTask: Task = {
      ...task,
      assigned_to: null,
      is_agent_task: true
    };

    if (task.id) {
      const { data: existingTask } = await supabase.from("tasks").select("id").eq("id", task.id).maybeSingle();
      if (existingTask) {
      const { error: taskUpdateError } = await supabase
        .from("tasks")
        .update({ assigned_to: null, is_agent_task: true })
        .eq("id", task.id);

      if (taskUpdateError) {
        throw new Error(`Failed to persist fallback assignment: ${taskUpdateError.message}`);
      }
      }
    }

    return fallbackTask;
  }

  // Compensating update strategy: increment load first, then task assignment,
  // and roll back counter if task update fails.
  const { error: incrementError } = await supabase
    .from("users")
    .update({ open_task_count: selected.open_task_count + 1 })
    .eq("id", selected.id);

  if (incrementError) {
    throw new Error(`Failed to increment assignee task count: ${incrementError.message}`);
  }

  try {
    if (task.id) {
      const { data: existingTask } = await supabase.from("tasks").select("id").eq("id", task.id).maybeSingle();
      if (existingTask) {
      const { error: taskUpdateError } = await supabase
        .from("tasks")
        .update({ assigned_to: selected.id, is_agent_task: false })
        .eq("id", task.id);

      if (taskUpdateError) {
        throw new Error(taskUpdateError.message);
      }
      }
    }

    emitTaskAssigned(selected.id, {
      taskId: task.id,
      role: task.assigned_role,
      isAgentTask: false
    });

    return {
      ...task,
      assigned_to: selected.id,
      is_agent_task: false
    };
  } catch (error) {
    await supabase
      .from("users")
      .update({ open_task_count: selected.open_task_count })
      .eq("id", selected.id);

    throw new Error(`Failed to assign task: ${error instanceof Error ? error.message : "unknown error"}`);
  }
}
