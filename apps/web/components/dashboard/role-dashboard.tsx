"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { DashboardMetric, DashboardPageFrame, DashboardSection } from "@/components/dashboard/dashboard-surface";
import { GoalsTable } from "@/components/dashboard/goals-table";
import { TaskCard } from "@/components/tasks/task-card";
import { TaskDrawer } from "@/components/tasks/task-drawer";
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
        { label: "My Open Tasks", value: tasks.filter((t) => t.status !== "completed").length, tone: "info" as const },
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
  }, [goals.length, role, tasks]);

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
            title="Tasks"
            description="Your current work queue arranged by urgency and execution state."
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {tasksQuery.isLoading ? (
                <>
                  <Skeleton className="h-40 w-full" />
                  <Skeleton className="h-40 w-full" />
                  <Skeleton className="h-40 w-full" />
                </>
              ) : (
                tasks
                  .sort((a, b) => Number(Boolean(b.is_overdue)) - Number(Boolean(a.is_overdue)))
                  .slice(0, 12)
                  .map((task) => <TaskCard key={task.id} task={task} onOpen={setSelectedTask} />)
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
