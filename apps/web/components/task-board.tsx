"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { connectSocket, disconnectSocket, useSocket } from "@/lib/socket";
import type { Role, Task, TaskStatus, User } from "@/lib/models";

type TaskListResponse = { items: Task[]; total: number; page: number; limit: number };
type RoutingSuggestion = { assigneeId: string; reason: string; confidence: number };

type RoleActionMap = {
  canRouteSuggest: boolean;
  canRouteConfirm: boolean;
  canDelegate: boolean;
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
    canDelegate: role === "ceo" || role === "cfo" || role === "manager"
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
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [delegateToByTask, setDelegateToByTask] = useState<Record<string, string>>({});
  const [delegateRoleByTask, setDelegateRoleByTask] = useState<Record<string, Role>>({});

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
        router.replace("/complete-profile");
        return;
      }

      const taskResponse = await apiFetch<TaskListResponse>("/api/tasks?limit=200");

      setCurrentUser(me);
      setTasks(taskResponse.items ?? []);
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
      {error ? <p className="rounded-2xl bg-[#fff0e6] px-4 py-3 text-sm text-[#9f4f20]">{error}</p> : null}

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        {statusColumns.map((status) => (
          <section key={status} className="min-w-0 rounded-3xl border border-[#ece7dd] bg-white p-3">
            <header className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-[#6b7280]">{status.replace("_", " ")}</h3>
              <span className="rounded-full bg-[#f8f5ef] px-2.5 py-1 text-xs font-semibold text-[#8b8f97]">
                {groupedTasks[status].length}
              </span>
            </header>

            <div className="space-y-3">
              {groupedTasks[status].map((task) => {
                const canTransition = canAssigneeTransition(task, currentUser?.id);
                const nextStatus = nextTransitionStatus(task);

                return (
                  <article key={task.id} className="min-w-0 rounded-2xl border border-[#ece7dd] bg-[#fbfaf7] p-3">
                    <p className="break-words font-semibold text-[#121826]">{task.title}</p>
                    <p className="mt-1 text-xs text-[#6b7280]">Role: {task.assigned_role.toUpperCase()}</p>
                    <p className="mt-1 break-all text-xs text-[#6b7280]">Assignee: {task.assigned_to ?? "Unassigned"}</p>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {canTransition && nextStatus ? (
                        <button
                          type="button"
                          onClick={() => void onTransition(task)}
                          disabled={busyTaskId === task.id}
                          className="rounded-xl bg-[#121826] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                        >
                          {nextStatus === "in_progress" ? "Start" : "Complete"}
                        </button>
                      ) : null}

                      {actions.canRouteSuggest && task.status === "routing" ? (
                        <button
                          type="button"
                          onClick={() => void onAutoRoute(task)}
                          disabled={busyTaskId === task.id}
                          className="rounded-xl bg-[#2a9d8f] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                        >
                          {actions.canRouteConfirm ? "Suggest + confirm" : "Suggest route"}
                        </button>
                      ) : null}
                    </div>

                    {actions.canDelegate ? (
                      <div className="mt-3 space-y-2 rounded-xl border border-[#e6e0d4] bg-white p-2">
                        <input
                          value={delegateToByTask[task.id] ?? ""}
                          onChange={(event) =>
                            setDelegateToByTask((current) => ({
                              ...current,
                              [task.id]: event.target.value
                            }))
                          }
                          placeholder="Delegate user UUID (blank = agent)"
                          className="w-full rounded-lg border border-[#ddd6c8] px-2 py-1.5 text-xs text-[#121826]"
                        />
                        <select
                          value={delegateRoleByTask[task.id] ?? task.assigned_role}
                          onChange={(event) =>
                            setDelegateRoleByTask((current) => ({
                              ...current,
                              [task.id]: event.target.value as Role
                            }))
                          }
                          className="w-full rounded-lg border border-[#ddd6c8] px-2 py-1.5 text-xs text-[#121826]"
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
                          className="w-full rounded-lg bg-[#ff6b35] px-2 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                        >
                          Delegate
                        </button>
                      </div>
                    ) : null}
                  </article>
                );
              })}

              {groupedTasks[status].length === 0 ? <p className="text-xs text-[#8b8f97]">No tasks.</p> : null}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
