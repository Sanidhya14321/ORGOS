"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { DashboardMetric, DashboardPageFrame, DashboardSection } from "@/components/dashboard/dashboard-surface";
import { GoalsTable } from "@/components/dashboard/goals-table";
import { TaskCard } from "@/components/tasks/task-card";
import { TaskDrawer } from "@/components/tasks/task-drawer";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { Role, Task, Goal, Applicant } from "@/lib/models";

function roleTitle(role: Role): string {
  switch (role) {
    case "ceo":
      return "Executive Command";
    case "cfo":
      return "Finance Command";
    case "manager":
      return "Manager Control";
    default:
      return "Worker Console";
  }
}

function roleDescription(role: Role): string {
  switch (role) {
    case "ceo":
      return "Track decomposition, review strategic reports, and monitor escalation pressure.";
    case "cfo":
      return "Review financial priorities, live task flow, and synthesis summaries.";
    case "manager":
      return "Coordinate assigned work, watch execution signals, and handle escalations.";
    default:
      return "Execute your assigned tasks and submit reports as work moves forward.";
  }
}

function priorityRank(task: Task): number {
  if (task.priority === "critical") {
    return 0;
  }
  if (task.priority === "high") {
    return 1;
  }
  if (task.priority === "medium" || !task.priority) {
    return 2;
  }
  return 3;
}

function sortTasksForExecution(a: Task, b: Task): number {
  const overdueDelta = Number(Boolean(b.is_overdue)) - Number(Boolean(a.is_overdue));
  if (overdueDelta !== 0) {
    return overdueDelta;
  }

  const priorityDelta = priorityRank(a) - priorityRank(b);
  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  const aDeadline = a.deadline ? new Date(a.deadline).getTime() : Number.MAX_SAFE_INTEGER;
  const bDeadline = b.deadline ? new Date(b.deadline).getTime() : Number.MAX_SAFE_INTEGER;
  if (aDeadline !== bDeadline) {
    return aDeadline - bDeadline;
  }

  return a.title.localeCompare(b.title);
}

export function RoleDashboard({ role }: { role: Role }) {
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  const tasksQuery = useQuery({
    queryKey: ["tasks", "dashboard", role],
    queryFn: () => apiFetch<{ items: Task[] }>("/api/tasks?limit=200"),
    select: (data) => data.items
  });

  const goalsQuery = useQuery({
    queryKey: ["goals", "dashboard", role],
    queryFn: () => apiFetch<{ items: Goal[] }>("/api/goals?limit=50"),
    select: (data) => data.items,
    enabled: role !== "worker"
  });

  const jobsQuery = useQuery({
    queryKey: ["recruitment-jobs", "dashboard", role],
    queryFn: () => apiFetch<{ items: Array<{ id: string }> }>("/api/recruitment/jobs?limit=100"),
    enabled: role !== "worker"
  });

  const applicantsQuery = useQuery({
    queryKey: ["recruitment-applicants", "dashboard", role],
    queryFn: async () => {
      const jobs = (await apiFetch<{ items: Array<{ id: string }> }>("/api/recruitment/jobs?limit=20")).items;
      const batches = await Promise.all(
        jobs.map((job) => apiFetch<{ items: Applicant[] }>(`/api/recruitment/jobs/${job.id}/applicants`).catch(() => ({ items: [] })))
      );
      return batches.flatMap((b) => b.items);
    },
    enabled: role === "ceo" || role === "cfo" || role === "manager"
  });

  const tasks = tasksQuery.data ?? [];
  const goals = goalsQuery.data ?? [];
  const openTasks = useMemo(
    () => tasks.filter((task) => task.status !== "completed" && task.status !== "cancelled"),
    [tasks]
  );
  const priorityQueue = useMemo(
    () => openTasks.slice().sort(sortTasksForExecution).slice(0, role === "worker" ? 8 : 10),
    [openTasks, role]
  );
  const blockedTasks = useMemo(
    () => openTasks.filter((task) => task.status === "blocked").slice().sort(sortTasksForExecution).slice(0, 6),
    [openTasks]
  );
  const activeTasks = useMemo(
    () => openTasks
      .filter((task) => task.status === "active" || task.status === "in_progress" || task.status === "pending")
      .slice()
      .sort(sortTasksForExecution)
      .slice(0, 6),
    [openTasks]
  );
  const completedTasks = useMemo(
    () => tasks
      .filter((task) => task.status === "completed")
      .slice()
      .sort((a, b) => new Date(b.updated_at ?? b.created_at ?? 0).getTime() - new Date(a.updated_at ?? a.created_at ?? 0).getTime())
      .slice(0, 6),
    [tasks]
  );
  const statusSummary = useMemo(
    () => [
      { label: "Pending", count: tasks.filter((task) => task.status === "pending").length, tone: "warning" as const },
      { label: "In flight", count: tasks.filter((task) => task.status === "active" || task.status === "in_progress").length, tone: "info" as const },
      { label: "Blocked", count: tasks.filter((task) => task.status === "blocked").length, tone: "danger" as const },
      { label: "Completed", count: tasks.filter((task) => task.status === "completed").length, tone: "success" as const }
    ],
    [tasks]
  );

  const metrics = useMemo(() => {
    const inProgress = tasks.filter((task) => task.status === "active" || task.status === "in_progress").length;
    const breaches = tasks.filter((task) => task.sla_status === "breached").length;
    const atRisk = tasks.filter((task) => task.sla_status === "at_risk").length;
    const loadPct = tasks.length > 0 ? Math.round(((inProgress + atRisk) / tasks.length) * 100) : 0;

    if (role === "worker") {
      return [
        { label: "My Open Tasks", value: tasks.filter((t) => t.status !== "completed").length, tone: "info" as const },
        { label: "At Risk", value: atRisk, tone: "warning" as const },
        { label: "SLA Breaches", value: breaches, tone: "danger" as const }
      ];
    }

    if (role === "manager") {
      return [
        { label: "Visible Open Tasks", value: openTasks.length, tone: "info" as const },
        { label: "Team Load", value: loadPct, tone: "warning" as const },
        { label: "SLA At Risk", value: atRisk, tone: "warning" as const }
      ];
    }

    return [
      { label: "Total Goals", value: goals.length, tone: "info" as const },
      { label: "Tasks In Progress", value: inProgress, tone: "success" as const },
      { label: "Team Load", value: loadPct, tone: "warning" as const },
      { label: "SLA Breaches", value: breaches, tone: breaches > 0 ? "danger" as const : "success" as const }
    ];
  }, [goals.length, openTasks.length, role, tasks]);

  const loading = tasksQuery.isLoading || (role !== "worker" && goalsQuery.isLoading);

  return (
    <DashboardPageFrame
      eyebrow={roleTitle(role)}
      title={roleTitle(role)}
      description={roleDescription(role)}
      actions={
        <div className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold ${loading ? "border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--muted)]" : "border-[var(--border)] bg-[var(--surface)] text-[var(--ink)]"}`}>
          <span className={`h-2.5 w-2.5 rounded-full ${loading ? "bg-[var(--warning)]" : "bg-[var(--success)]"}`} />
          {loading ? "Syncing workspace" : "Workspace ready"}
        </div>
      }
    >
      <div className="space-y-8">
        <section className={`grid gap-4 ${metrics.length === 4 ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-4" : "grid-cols-1 md:grid-cols-3"}`}>
          {metrics.map((metric) => (
            <DashboardMetric key={metric.label} label={metric.label} value={metric.value} tone={metric.tone} loading={loading} />
          ))}
        </section>

        {role === "ceo" || role === "cfo" ? (
          <DashboardSection
            title="Goals"
            description="Executive goal health with completion, SLA pressure, and task breakdowns."
          >
            <GoalsTable goals={goals} tasks={tasks} loading={goalsQuery.isLoading || tasksQuery.isLoading} />
          </DashboardSection>
        ) : null}

        {role !== "ceo" && role !== "cfo" ? (
          <DashboardSection
            title={role === "manager" ? "Execution queue" : "Priority queue"}
            description={
              role === "manager"
                ? "A task-first view of the work currently visible in your reporting scope."
                : "Your most urgent execution work, ranked by overdue risk, priority, and current state."
            }
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{priorityQueue.length} prioritized cards</Badge>
                <Link
                  href="/dashboard/task-board"
                  className="rounded-full border border-border bg-bg-surface px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-text-secondary transition hover:border-border-strong hover:bg-bg-elevated hover:text-text-primary"
                >
                  Open full board
                </Link>
              </div>
            }
          >
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(290px,0.95fr)]">
              <div className="grid gap-3 md:grid-cols-2">
                {tasksQuery.isLoading ? (
                  <>
                    <Skeleton className="h-40 w-full" />
                    <Skeleton className="h-40 w-full" />
                    <Skeleton className="h-40 w-full" />
                    <Skeleton className="h-40 w-full" />
                  </>
                ) : priorityQueue.length > 0 ? (
                  priorityQueue.map((task) => <TaskCard key={task.id} task={task} onOpen={setSelectedTask} />)
                ) : (
                  <div className="rounded-2xl border border-dashed border-border p-5 text-sm text-text-secondary md:col-span-2">
                    No active work is visible right now.
                  </div>
                )}
              </div>

              <div className="space-y-3">
                {statusSummary.map((item) => (
                  <div key={item.label} className="rounded-2xl border border-border bg-bg-elevated p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-text-primary">{item.label}</p>
                      <Badge variant="outline">{item.count}</Badge>
                    </div>
                    <p className="mt-2 text-xs text-text-secondary">
                      {item.label === "Pending"
                        ? "New work that can be started or completed directly from the drawer."
                        : item.label === "In flight"
                          ? "Tasks currently moving through active execution."
                          : item.label === "Blocked"
                            ? "Work that needs unblocking or a resume action."
                            : "Recently completed work in your visible queue."}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </DashboardSection>
        ) : null}

        {role !== "ceo" && role !== "cfo" ? (
          <div className="grid gap-6 xl:grid-cols-2">
            <DashboardSection
              title="Blocked and waiting"
              description="Tasks that need intervention, clarification, or a resume action."
            >
              <div className="grid gap-3 md:grid-cols-2">
                {tasksQuery.isLoading ? (
                  <>
                    <Skeleton className="h-36 w-full" />
                    <Skeleton className="h-36 w-full" />
                  </>
                ) : blockedTasks.length > 0 ? (
                  blockedTasks.map((task) => <TaskCard key={task.id} task={task} onOpen={setSelectedTask} />)
                ) : (
                  <div className="rounded-2xl border border-dashed border-border p-5 text-sm text-text-secondary md:col-span-2">
                    No blocked tasks in your current queue.
                  </div>
                )}
              </div>
            </DashboardSection>

            <DashboardSection
              title="Recently completed"
              description="Closed work that just moved out of your execution queue."
            >
              <div className="grid gap-3 md:grid-cols-2">
                {tasksQuery.isLoading ? (
                  <>
                    <Skeleton className="h-36 w-full" />
                    <Skeleton className="h-36 w-full" />
                  </>
                ) : completedTasks.length > 0 ? (
                  completedTasks.map((task) => <TaskCard key={task.id} task={task} onOpen={setSelectedTask} />)
                ) : (
                  <div className="rounded-2xl border border-dashed border-border p-5 text-sm text-text-secondary md:col-span-2">
                    No completed tasks yet.
                  </div>
                )}
              </div>
            </DashboardSection>
          </div>
        ) : null}

        {role !== "ceo" && role !== "cfo" ? (
          <DashboardSection
            title={role === "manager" ? "Team execution snapshot" : "Execution snapshot"}
            description="A compact view of the next tasks currently moving through your queue."
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {tasksQuery.isLoading ? (
                <>
                  <Skeleton className="h-36 w-full" />
                  <Skeleton className="h-36 w-full" />
                  <Skeleton className="h-36 w-full" />
                </>
              ) : activeTasks.length > 0 ? (
                activeTasks.map((task) => <TaskCard key={task.id} task={task} onOpen={setSelectedTask} />)
              ) : (
                <div className="rounded-2xl border border-dashed border-border p-5 text-sm text-text-secondary xl:col-span-3">
                  No in-flight tasks are active right now.
                </div>
              )}
            </div>
          </DashboardSection>
        ) : null}

        {(role === "ceo" || role === "cfo" || role === "manager") ? (
          <DashboardSection
            title="Hiring funnel"
            description="Open positions, applicant volume, AI score, and referral flow."
          >
            <div className="grid gap-4 md:grid-cols-4">
              <DashboardMetric label="Open Positions" value={jobsQuery.data?.items?.length ?? 0} loading={jobsQuery.isLoading} tone="info" />
              <DashboardMetric label="Total Applicants" value={applicantsQuery.data?.length ?? 0} loading={applicantsQuery.isLoading} tone="success" />
              <DashboardMetric
                label="Avg AI Score"
                value={Math.round(((applicantsQuery.data ?? []).reduce((sum, item) => sum + (item.ai_score ?? 0), 0) / Math.max((applicantsQuery.data ?? []).length, 1)) * 100)}
                loading={applicantsQuery.isLoading}
                tone="info"
              />
              <DashboardMetric label="Referrals This Month" value={(applicantsQuery.data ?? []).filter((a) => a.source === "referral").length} loading={applicantsQuery.isLoading} tone="warning" />
            </div>
          </DashboardSection>
        ) : null}

        <TaskDrawer task={selectedTask} open={Boolean(selectedTask)} onOpenChange={(open) => !open && setSelectedTask(null)} />
      </div>
    </DashboardPageFrame>
  );
}
