import type { Task } from "@orgos/shared-types";
import { createSupabaseServiceClient } from "../lib/clients.js";
import { readEnv } from "../config/env.js";
import { emitTaskAssigned } from "./notifier.js";
import { syncUserOpenTaskCounts } from "./workloadService.js";

interface CandidateUser {
  id: string;
  open_task_count: number;
  skills: string[] | null;
  position_id?: string | null;
  department?: string | null;
  role?: string | null;
}

type AssignmentSelectionInput = {
  candidates: CandidateUser[];
  task: Task;
  positionCapacityById?: Map<string, number>;
};

type AssignTaskOptions = {
  persistTaskUpdate?: boolean;
  reserveCapacity?: boolean;
  emitAssignmentEvent?: boolean;
};

const MAX_OPEN_TASKS = 8;

function hasRequiredSkills(candidate: CandidateUser, requiredSkills: string[]): boolean {
  const candidateSkills = candidate.skills ?? [];
  return requiredSkills.every((skill) => candidateSkills.includes(skill));
}

function scoreCandidate(candidate: CandidateUser, requiredSkills: string[], preferredPositionIds: string[]): number {
  const candidateSkills = new Set(candidate.skills ?? []);
  const matched = requiredSkills.reduce((count, skill) => (candidateSkills.has(skill) ? count + 1 : count), 0);
  const positionBonus = candidate.position_id && preferredPositionIds.includes(candidate.position_id) ? 150 : 0;

  // Prefer exact seat match, then skill coverage, then lower load.
  return positionBonus + matched * 100 - candidate.open_task_count;
}

export function selectAssignmentCandidate(input: AssignmentSelectionInput): CandidateUser | null {
  const { candidates, task, positionCapacityById = new Map<string, number>() } = input;
  const requiredSkills = task.required_skills ?? [];
  const preferredPositionIds = [
    ...(((task as Task & { assigned_position_id?: string | null }).assigned_position_id
      ? [String((task as Task & { assigned_position_id?: string | null }).assigned_position_id)]
      : [])),
    ...(((task as Task & { suggested_position_ids?: string[] }).suggested_position_ids ?? []).map((value) => String(value)))
  ];
  const eligiblePositionIds = (task as Task & { eligible_position_ids?: string[] }).eligible_position_ids ?? [];

  let filteredCandidates = candidates.filter((candidate) => {
    const positionCapacity = candidate.position_id
      ? (positionCapacityById.get(candidate.position_id) ?? MAX_OPEN_TASKS)
      : MAX_OPEN_TASKS;
    return candidate.open_task_count < positionCapacity;
  });

  if (eligiblePositionIds.length > 0) {
    filteredCandidates = filteredCandidates.filter((candidate) => candidate.position_id && eligiblePositionIds.includes(candidate.position_id));
  }

  if (preferredPositionIds.length === 0 && task.assigned_role) {
    filteredCandidates = filteredCandidates.filter((candidate) => candidate.role === task.assigned_role);
  }

  const exactPositionCandidates = preferredPositionIds.length > 0
    ? filteredCandidates.filter((candidate) => candidate.position_id && preferredPositionIds.includes(candidate.position_id))
    : [];

  const candidatePool = exactPositionCandidates.length > 0 ? exactPositionCandidates : filteredCandidates;

  return candidatePool
    .map((candidate) => ({
      candidate,
      score: scoreCandidate(candidate, requiredSkills, preferredPositionIds),
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
}

export async function assignTask(task: Task, options: AssignTaskOptions = {}): Promise<Task> {
  const env = readEnv();
  const supabase = createSupabaseServiceClient(env);
  const persistTaskUpdate = options.persistTaskUpdate ?? true;
  const reserveCapacity = options.reserveCapacity ?? true;
  const emitAssignmentEvent = options.emitAssignmentEvent ?? true;

  let query = supabase
    .from("users")
    .select("id, open_task_count, skills, position_id, department, role")
    .eq("agent_enabled", true)
    .eq("status", "active")
    .order("open_task_count", { ascending: true });

  const eligibleAssigneeIds = (task as Task & { eligible_assignee_ids?: string[] }).eligible_assignee_ids;
  if (eligibleAssigneeIds && eligibleAssigneeIds.length > 0) {
    query = query.in("id", eligibleAssigneeIds);
  }

  const taskOrgId = (task as Task & { org_id?: string }).org_id;
  if (taskOrgId) {
    query = query.eq("org_id", taskOrgId);
  }

  const eligiblePositionIds = (task as Task & { eligible_position_ids?: string[] }).eligible_position_ids ?? [];

  const { data: candidates, error: candidatesError } = await query;

  if (candidatesError) {
    throw new Error(`Failed to load assignment candidates: ${candidatesError.message}`);
  }

  const candidateList = (candidates ?? []) as CandidateUser[];

  const positionIds = Array.from(
    new Set(
      candidateList
        .map((candidate) => candidate.position_id)
        .filter((value): value is string => typeof value === "string" && value.length > 0)
    )
  );

  const positionCapacityById = new Map<string, number>();
  if (positionIds.length > 0) {
    const { data: positions, error: positionsError } = await supabase
      .from("positions")
      .select("id, max_concurrent_tasks")
      .in("id", positionIds);

    if (positionsError) {
      throw new Error(`Failed to load position capacities: ${positionsError.message}`);
    }

    for (const position of positions ?? []) {
      positionCapacityById.set(
        String(position.id),
        Math.max(1, Number(position.max_concurrent_tasks ?? MAX_OPEN_TASKS))
      );
    }
  }

  const selected = selectAssignmentCandidate({
    candidates: candidateList,
    task: {
      ...task,
      ...(eligiblePositionIds.length > 0 ? { eligible_position_ids: eligiblePositionIds } : {})
    } as Task,
    positionCapacityById
  });

  if (!selected) {
    const fallbackTask: Task = {
      ...task,
      assigned_to: null,
      is_agent_task: true
    };

    if (task.id && persistTaskUpdate) {
      const { data: existingTask } = await supabase.from("tasks").select("id, assigned_to").eq("id", task.id).maybeSingle();
      if (existingTask) {
        const { error: taskUpdateError } = await supabase
          .from("tasks")
          .update({ assigned_to: null, is_agent_task: true })
          .eq("id", task.id);

        if (taskUpdateError) {
          throw new Error(`Failed to persist fallback assignment: ${taskUpdateError.message}`);
        }

        await syncUserOpenTaskCounts(supabase, [existingTask.assigned_to as string | null | undefined]);
      }
    }

    return fallbackTask;
  }

  if (reserveCapacity) {
    // Compensating update strategy: increment load first, then task assignment,
    // and roll back counter if task update fails.
    const { error: incrementError } = await supabase
      .from("users")
      .update({ open_task_count: selected.open_task_count + 1 })
      .eq("id", selected.id);

    if (incrementError) {
      throw new Error(`Failed to increment assignee task count: ${incrementError.message}`);
    }
  }

  try {
    let previousAssigneeId: string | null = null;
    if (task.id && persistTaskUpdate) {
      const { data: existingTask } = await supabase.from("tasks").select("id, assigned_to").eq("id", task.id).maybeSingle();
      if (existingTask) {
        previousAssigneeId = (existingTask.assigned_to as string | null | undefined) ?? null;
        const { error: taskUpdateError } = await supabase
          .from("tasks")
          .update({ assigned_to: selected.id, is_agent_task: false })
          .eq("id", task.id);

        if (taskUpdateError) {
          throw new Error(taskUpdateError.message);
        }

        await syncUserOpenTaskCounts(supabase, [selected.id, previousAssigneeId]);
      }
    }

    if (emitAssignmentEvent) {
      emitTaskAssigned(selected.id, {
        taskId: task.id,
        role: task.assigned_role,
        isAgentTask: false
      });
    }

    return {
      ...task,
      assigned_to: selected.id,
      assigned_position_id: (selected.position_id as string | null | undefined) ?? (task as Task & { assigned_position_id?: string | null }).assigned_position_id ?? null,
      is_agent_task: false
    };
  } catch (error) {
    if (reserveCapacity) {
      await supabase
        .from("users")
        .update({ open_task_count: selected.open_task_count })
        .eq("id", selected.id);
    }

    await syncUserOpenTaskCounts(supabase, [selected.id]);

    throw new Error(`Failed to assign task: ${error instanceof Error ? error.message : "unknown error"}`);
  }
}
