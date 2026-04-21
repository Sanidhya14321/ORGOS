"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { connectSocket, disconnectSocket, useSocket } from "@/lib/socket";
import type { Goal, Role, Task, TaskStatus, User } from "@/lib/models";

type TaskListResponse = { items: Task[]; total: number; page: number; limit: number };
type RoutingSuggestion = { assigneeId: string; reason: string; confidence: number };

type RoleActionMap = {
  canRouteSuggest: boolean;
  canRouteConfirm: boolean;
  canDelegate: boolean;
  canExecutiveApprove: boolean;
  canCreateTask: boolean;
};

const statusColumns: TaskStatus[] = [
  "routing",
  "active",
  "pending",
  "in_progress",
  "blocked",
  "completed",
  "rejected",
  "cancelled"
];

function roleActions(role: Role): RoleActionMap {
  return {
    canRouteSuggest: role === "ceo" || role === "cfo" || role === "manager",
    canRouteConfirm: role === "ceo" || role === "cfo",
    canDelegate: role === "ceo" || role === "cfo" || role === "manager",
    canExecutiveApprove: role === "ceo" || role === "cfo",
    canCreateTask: role === "ceo" || role === "cfo" || role === "manager"
  };
}

function canAssigneeTransition(task: Task, userId: string | undefined): boolean {
  if (!userId || task.assigned_to !== userId) {
    return false;
  }

  return task.status === "pending" || task.status === "in_progress";
}

function nextTransitionStatus(task: Task): TaskStatus | null {
  if (task.status === "pending") {
    return "in_progress";
  }
  if (task.status === "in_progress") {
    return "completed";
  }
  return null;
}

export function TaskBoard() {
  const router = useRouter();
  const socket = useSocket();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [delegateToByTask, setDelegateToByTask] = useState<Record<string, string>>({});
  const [delegateRoleByTask, setDelegateRoleByTask] = useState<Record<string, Role>>({});
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [creatingTask, setCreatingTask] = useState(false);
  const [newTaskGoalId, setNewTaskGoalId] = useState("");
  const [manualGoalId, setManualGoalId] = useState("");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskCriteria, setNewTaskCriteria] = useState("");
  const [newTaskRole, setNewTaskRole] = useState<Role>("manager");
  const [newTaskPriority, setNewTaskPriority] = useState<"low" | "medium" | "high" | "critical">("medium");

  const actions = useMemo(() => roleActions(currentUser?.role ?? "worker"), [currentUser?.role]);

  async function loadBoard() {
    try {
      setLoading(true);
      setError(null);

      const me = await apiFetch<User>("/api/me");
      if (me.status === "pending") {
        setCurrentUser(me);
        router.replace("/pending");
        return;
      }

      if (!me.org_id) {
        setCurrentUser(me);
        router.replace("/pending");
        return;
      }

      const [taskResponse, goalResponse] = await Promise.all([
        apiFetch<TaskListResponse>("/api/tasks?limit=200"),
        apiFetch<{ items: Goal[] }>("/api/goals?limit=100").catch(() => ({ items: [] as Goal[] }))
      ]);

      setCurrentUser(me);
      setTasks(taskResponse.items ?? []);
      setGoals(goalResponse.items ?? []);
      if (!newTaskGoalId && (goalResponse.items?.length ?? 0) > 0) {
        setNewTaskGoalId(goalResponse.items[0]?.id ?? "");
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load task board");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    connectSocket();
    void loadBoard();

    return () => disconnectSocket();
  }, []);

  useEffect(() => {
    const refresh = () => {
      void loadBoard();
    };

    socket.on("task:assigned", refresh);
    socket.on("task:status_changed", refresh);
    socket.on("task:routing_ready", refresh);
    socket.on("task:sla_at_risk", refresh);
    socket.on("task:sla_breached", refresh);

    return () => {
      socket.off("task:assigned", refresh);
      socket.off("task:status_changed", refresh);
      socket.off("task:routing_ready", refresh);
      socket.off("task:sla_at_risk", refresh);
      socket.off("task:sla_breached", refresh);
    };
  }, [socket]);

  async function onTransition(task: Task) {
    const next = nextTransitionStatus(task);
    if (!next) {
      return;
    }

    try {
      setBusyTaskId(task.id);
      await apiFetch<Task>(`/api/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: next })
      });
      await loadBoard();
    } catch (transitionError) {
      setError(transitionError instanceof Error ? transitionError.message : "Unable to update task status");
    } finally {
      setBusyTaskId(null);
    }
  }

  async function onRoutingSuggest(task: Task): Promise<RoutingSuggestion[]> {
    const response = await apiFetch<{ suggestions: RoutingSuggestion[] }>(`/api/tasks/${task.id}/routing-suggest`, {
      method: "POST",
      body: JSON.stringify({})
    });

    return response.suggestions ?? [];
  }

  async function onRoutingConfirm(task: Task, suggestions: RoutingSuggestion[]) {
    await apiFetch(`/api/tasks/${task.id}/routing-confirm`, {
      method: "POST",
      body: JSON.stringify({
        confirmed: suggestions,
        status: "active"
      })
    });
  }

  async function onAutoRoute(task: Task) {
    try {
      setBusyTaskId(task.id);
      const suggestions = await onRoutingSuggest(task);
      if (!actions.canRouteConfirm) {
        await loadBoard();
        return;
      }

      if (suggestions.length > 0) {
        await onRoutingConfirm(task, suggestions);
      }

      await loadBoard();
    } catch (routingError) {
      setError(routingError instanceof Error ? routingError.message : "Unable to process routing action");
    } finally {
      setBusyTaskId(null);
    }
  }

  async function onDelegate(task: Task) {
    const delegateTo = delegateToByTask[task.id] ?? "";
    const delegateRole = delegateRoleByTask[task.id] ?? task.assigned_role;

    try {
      setBusyTaskId(task.id);
      await apiFetch<Task>(`/api/tasks/${task.id}/delegate`, {
        method: "POST",
        body: JSON.stringify({
          assignTo: delegateTo.trim().length > 0 ? delegateTo.trim() : null,
          role: delegateRole
        })
      });
      await loadBoard();
    } catch (delegateError) {
      setError(delegateError instanceof Error ? delegateError.message : "Unable to delegate task");
    } finally {
      setBusyTaskId(null);
    }
  }

  async function onExecutiveDecision(task: Task, approved: boolean) {
    try {
      setBusyTaskId(task.id);
      await apiFetch(`/api/tasks/${task.id}/approve`, {
        method: "POST",
        body: JSON.stringify({ approved })
      });
      await loadBoard();
    } catch (approvalError) {
      setError(approvalError instanceof Error ? approvalError.message : "Unable to apply executive approval decision");
    } finally {
      setBusyTaskId(null);
    }
  }

  async function onCreateTask() {
    if (!actions.canCreateTask) {
      return;
    }

    const effectiveGoalId = newTaskGoalId || manualGoalId.trim();
    if (!effectiveGoalId || !newTaskTitle.trim() || !newTaskCriteria.trim()) {
      setError("Goal, title, and success criteria are required to create a task");
      return;
    }

    try {
      setCreatingTask(true);
      await apiFetch("/api/tasks", {
        method: "POST",
        body: JSON.stringify({
          goalId: effectiveGoalId,
          title: newTaskTitle.trim(),
          successCriteria: newTaskCriteria.trim(),
          assignedRole: newTaskRole,
          priority: newTaskPriority,
          depth: 0
        })
      });

      setNewTaskTitle("");
      setNewTaskCriteria("");
      await loadBoard();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to create task");
    } finally {
      setCreatingTask(false);
    }
  }

  async function onDropToStatus(targetStatus: TaskStatus) {
    if (!draggingTaskId) {
      return;
    }

    const task = tasks.find((item) => item.id === draggingTaskId);
    setDraggingTaskId(null);

    if (!task || task.status === targetStatus) {
      return;
    }

    try {
      setBusyTaskId(task.id);

      const expectedNext = nextTransitionStatus(task);
      if (expectedNext && expectedNext === targetStatus && canAssigneeTransition(task, currentUser?.id)) {
        await apiFetch(`/api/tasks/${task.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: targetStatus })
        });
        await loadBoard();
        return;
      }

      if (actions.canExecutiveApprove && task.assigned_role === "manager" && (targetStatus === "completed" || targetStatus === "in_progress")) {
        await apiFetch(`/api/tasks/${task.id}/approve`, {
          method: "POST",
          body: JSON.stringify({ approved: targetStatus === "completed" })
        });
        await loadBoard();
        return;
      }

      if (actions.canRouteSuggest && task.status === "routing" && targetStatus === "active") {
        await onAutoRoute(task);
        return;
      }

      setError("Drag-and-drop transition is not allowed for this task/role");
    } catch (dropError) {
      setError(dropError instanceof Error ? dropError.message : "Unable to move task");
    } finally {
      setBusyTaskId(null);
    }
  }

  const groupedTasks = useMemo(() => {
    const entries: Record<TaskStatus, Task[]> = {
      routing: [],
      active: [],
      pending: [],
      in_progress: [],
      blocked: [],
      completed: [],
      rejected: [],
      cancelled: []
    };

    for (const task of tasks) {
      entries[task.status].push(task);
    }

    for (const status of statusColumns) {
      entries[status].sort((a, b) => a.title.localeCompare(b.title));
    }

    return entries;
  }, [tasks]);

  if (loading) {
    return <p className="text-sm text-[#6b7280]">Loading task board...</p>;
  }

  return (
    <div className="space-y-4">
      {error ? <p className="rounded-2xl border border-[var(--warn)]/30 bg-[var(--warn)]/12 px-4 py-3 text-sm text-[var(--warn)]">{error}</p> : null}

      {actions.canCreateTask ? (
        <section className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">Create task</h2>
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
            <select
              value={newTaskGoalId}
              onChange={(event) => setNewTaskGoalId(event.target.value)}
              className="rounded-xl border border-[var(--border)] bg-[#0f1115] px-3 py-2 text-sm text-[var(--ink)]"
            >
              <option value="">Select goal</option>
              {goals.map((goal) => (
                <option key={goal.id} value={goal.id}>{goal.title}</option>
              ))}
            </select>
            <input
              value={manualGoalId}
              onChange={(event) => setManualGoalId(event.target.value)}
              placeholder="Or paste Goal UUID"
              className="rounded-xl border border-[var(--border)] bg-[#0f1115] px-3 py-2 text-sm text-[var(--ink)]"
            />
            <input
              value={newTaskTitle}
              onChange={(event) => setNewTaskTitle(event.target.value)}
              placeholder="Task title"
              className="rounded-xl border border-[var(--border)] bg-[#0f1115] px-3 py-2 text-sm text-[var(--ink)]"
            />
            <input
              value={newTaskCriteria}
              onChange={(event) => setNewTaskCriteria(event.target.value)}
              placeholder="Success criteria"
              className="rounded-xl border border-[var(--border)] bg-[#0f1115] px-3 py-2 text-sm text-[var(--ink)]"
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                value={newTaskRole}
                onChange={(event) => setNewTaskRole(event.target.value as Role)}
                className="rounded-xl border border-[var(--border)] bg-[#0f1115] px-2 py-2 text-sm text-[var(--ink)]"
              >
                <option value="manager">Manager</option>
                <option value="worker">Worker</option>
                {(currentUser?.role === "ceo" || currentUser?.role === "cfo") ? <option value="cfo">CFO</option> : null}
              </select>
              <select
                value={newTaskPriority}
                onChange={(event) => setNewTaskPriority(event.target.value as "low" | "medium" | "high" | "critical")}
                className="rounded-xl border border-[var(--border)] bg-[#0f1115] px-2 py-2 text-sm text-[var(--ink)]"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <button
              type="button"
              onClick={() => void onCreateTask()}
              disabled={creatingTask}
              className="rounded-xl bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-[#0f1115] disabled:opacity-60"
            >
              {creatingTask ? "Creating..." : "Add task"}
            </button>
          </div>
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        {statusColumns.map((status) => (
          <section
            key={status}
            className="min-w-0 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-3"
            onDragOver={(event) => {
              event.preventDefault();
            }}
            onDrop={(event) => {
              event.preventDefault();
              void onDropToStatus(status);
            }}
          >
            <header className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">{status.replace("_", " ")}</h3>
              <span className="rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-xs font-semibold text-[var(--muted)]">
                {groupedTasks[status].length}
              </span>
            </header>

            <div className="space-y-3">
              {groupedTasks[status].map((task) => {
                const canTransition = canAssigneeTransition(task, currentUser?.id);
                const nextStatus = nextTransitionStatus(task);

                return (
                  <article
                    key={task.id}
                    className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-3"
                    draggable
                    onDragStart={() => setDraggingTaskId(task.id)}
                    onDragEnd={() => setDraggingTaskId(null)}
                  >
                    <p className="break-words font-semibold text-[var(--ink)]">{task.title}</p>
                    <p className="mt-1 text-xs text-[var(--muted)]">Role: {task.assigned_role.toUpperCase()}</p>
                    <p className="mt-1 break-all text-xs text-[var(--muted)]">Assignee: {task.assigned_to ?? "Unassigned"}</p>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {canTransition && nextStatus ? (
                        <button
                          type="button"
                          onClick={() => void onTransition(task)}
                          disabled={busyTaskId === task.id}
                          className="rounded-xl bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[#0f1115] disabled:opacity-60"
                        >
                          {nextStatus === "in_progress" ? "Start" : "Complete"}
                        </button>
                      ) : null}

                      {actions.canRouteSuggest && task.status === "routing" ? (
                        <button
                          type="button"
                          onClick={() => void onAutoRoute(task)}
                          disabled={busyTaskId === task.id}
                          className="rounded-xl bg-[var(--ok)] px-3 py-1.5 text-xs font-semibold text-[#08120d] disabled:opacity-60"
                        >
                          {actions.canRouteConfirm ? "Suggest + confirm" : "Suggest route"}
                        </button>
                      ) : null}

                      {actions.canExecutiveApprove && task.assigned_role === "manager" && (task.status === "pending" || task.status === "completed") ? (
                        <>
                          <button
                            type="button"
                            onClick={() => void onExecutiveDecision(task, true)}
                            disabled={busyTaskId === task.id}
                            className="rounded-xl bg-[var(--ok)] px-3 py-1.5 text-xs font-semibold text-[#08120d] disabled:opacity-60"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => void onExecutiveDecision(task, false)}
                            disabled={busyTaskId === task.id}
                            className="rounded-xl border border-[var(--warn)]/60 bg-[var(--warn)]/10 px-3 py-1.5 text-xs font-semibold text-[var(--warn)] disabled:opacity-60"
                          >
                            Reject
                          </button>
                        </>
                      ) : null}
                    </div>

                    {actions.canDelegate ? (
                      <div className="mt-3 space-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2">
                        <input
                          value={delegateToByTask[task.id] ?? ""}
                          onChange={(event) =>
                            setDelegateToByTask((current) => ({
                              ...current,
                              [task.id]: event.target.value
                            }))
                          }
                          placeholder="Delegate user UUID (blank = agent)"
                          className="w-full rounded-lg border border-[var(--border)] bg-[#0f1115] px-2 py-1.5 text-xs text-[var(--ink)]"
                        />
                        <select
                          value={delegateRoleByTask[task.id] ?? task.assigned_role}
                          onChange={(event) =>
                            setDelegateRoleByTask((current) => ({
                              ...current,
                              [task.id]: event.target.value as Role
                            }))
                          }
                          className="w-full rounded-lg border border-[var(--border)] bg-[#0f1115] px-2 py-1.5 text-xs text-[var(--ink)]"
                        >
                          <option value="ceo">CEO</option>
                          <option value="cfo">CFO</option>
                          <option value="manager">Manager</option>
                          <option value="worker">Worker</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => void onDelegate(task)}
                          disabled={busyTaskId === task.id}
                          className="w-full rounded-lg bg-[var(--accent)] px-2 py-1.5 text-xs font-semibold text-[#0f1115] disabled:opacity-60"
                        >
                          Delegate
                        </button>
                      </div>
                    ) : null}
                  </article>
                );
              })}

              {groupedTasks[status].length === 0 ? <p className="text-xs text-[var(--muted)]">No tasks.</p> : null}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
