import type { Task } from "@orgos/shared-types";
import { createSupabaseServiceClient } from "../lib/clients.js";
import { readEnv } from "../config/env.js";
import { emitTaskAssigned } from "./notifier.js";

interface CandidateUser {
  id: string;
  open_task_count: number;
  skills: string[] | null;
}

const MAX_OPEN_TASKS = 8;

function hasRequiredSkills(candidate: CandidateUser, requiredSkills: string[]): boolean {
  const candidateSkills = candidate.skills ?? [];
  return requiredSkills.every((skill) => candidateSkills.includes(skill));
}

function scoreCandidate(candidate: CandidateUser, requiredSkills: string[]): number {
  const candidateSkills = new Set(candidate.skills ?? []);
  const matched = requiredSkills.reduce((count, skill) => (candidateSkills.has(skill) ? count + 1 : count), 0);

  // Heavily weight skill coverage, then prefer lower load.
  return matched * 100 - candidate.open_task_count;
}

export async function assignTask(task: Task): Promise<Task> {
  const env = readEnv();
  const supabase = createSupabaseServiceClient(env);

  let query = supabase
    .from("users")
    .select("id, open_task_count, skills")
    .eq("role", task.assigned_role)
    .eq("agent_enabled", true)
    .eq("status", "active")
    .lte("open_task_count", MAX_OPEN_TASKS)
    .order("open_task_count", { ascending: true });

  const eligibleAssigneeIds = (task as Task & { eligible_assignee_ids?: string[] }).eligible_assignee_ids;
  if (eligibleAssigneeIds && eligibleAssigneeIds.length > 0) {
    query = query.in("id", eligibleAssigneeIds);
  }

  const taskOrgId = (task as Task & { org_id?: string }).org_id;
  if (taskOrgId) {
    query = query.eq("org_id", taskOrgId);
  }

  const { data: candidates, error: candidatesError } = await query;

  if (candidatesError) {
    throw new Error(`Failed to load assignment candidates: ${candidatesError.message}`);
  }

  const candidateList = (candidates ?? []) as CandidateUser[];
  const requiredSkills = task.required_skills ?? [];

  const selected = candidateList
    .map((candidate) => ({
      candidate,
      score: scoreCandidate(candidate, requiredSkills),
      coversAllSkills: hasRequiredSkills(candidate, requiredSkills)
    }))
    .sort((a, b) => {
      if (a.coversAllSkills !== b.coversAllSkills) {
        return a.coversAllSkills ? -1 : 1;
      }
      if (a.score !== b.score) {
        return b.score - a.score;
      }
      return a.candidate.open_task_count - b.candidate.open_task_count;
    })
    .at(0)?.candidate ?? null;

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
