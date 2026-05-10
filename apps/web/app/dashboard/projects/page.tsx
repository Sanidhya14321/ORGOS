"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, CheckSquare, ChevronRight, Layers3, Search, Sparkles, Target, TrendingUp } from "lucide-react";
import type { Goal, Role, Task } from "@/lib/models";

type MeResponse = { role: Role; org_id?: string | null };

type ProjectRow = {
  goal: Goal;
  tasks: Task[];
  totalTasks: number;
  completedTasks: number;
  activeTasks: number;
  blockedTasks: number;
  completionRate: number;
  topTasks: Task[];
};

export default function ProjectsDashboardPage() {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<Goal["status"] | "all">("all");

  const meQuery = useQuery({
    queryKey: ["projects-me"],
    queryFn: () => apiFetch<MeResponse>("/api/me")
  });

  const goalsQuery = useQuery({
    queryKey: ["projects-goals", meQuery.data?.org_id],
    queryFn: () => apiFetch<{ items: Goal[] }>("/api/goals?limit=100"),
    select: (data) => data.items,
    enabled: Boolean(meQuery.data?.org_id)
  });

  const tasksQuery = useQuery({
    queryKey: ["projects-tasks", meQuery.data?.org_id],
    queryFn: () => apiFetch<{ items: Task[] }>("/api/tasks?limit=300"),
    select: (data) => data.items,
    enabled: Boolean(meQuery.data?.org_id)
  });

  const projectRows = useMemo<ProjectRow[]>(() => {
    const goals = goalsQuery.data ?? [];
    const tasks = tasksQuery.data ?? [];

    return goals.map((goal) => {
      const goalTasks = tasks.filter((task) => task.goal_id === goal.id);
      const completedTasks = goalTasks.filter((task) => task.status === "completed").length;
      const activeTasks = goalTasks.filter((task) => task.status === "active" || task.status === "in_progress").length;
      const blockedTasks = goalTasks.filter((task) => task.status === "blocked").length;
      const completionRate = goalTasks.length > 0 ? Math.round((completedTasks / goalTasks.length) * 100) : 0;

      return {
        goal,
        tasks: goalTasks,
        totalTasks: goalTasks.length,
        completedTasks,
        activeTasks,
        blockedTasks,
        completionRate,
        topTasks: goalTasks.slice(0, 3)
      };
    });
  }, [goalsQuery.data, tasksQuery.data]);

  const filteredRows = useMemo(() => {
    const lowered = query.trim().toLowerCase();
    return projectRows.filter((row) => {
      const statusMatch = statusFilter === "all" ? true : row.goal.status === statusFilter;
      if (!statusMatch) {
        return false;
      }

      if (!lowered) {
        return true;
      }

      return (
        row.goal.title.toLowerCase().includes(lowered) ||
        (row.goal.description ?? "").toLowerCase().includes(lowered) ||
        row.topTasks.some((task) => task.title.toLowerCase().includes(lowered))
      );
    });
  }, [projectRows, query, statusFilter]);

  const metrics = useMemo(() => {
    const totalGoals = projectRows.length;
    const totalTasks = projectRows.reduce((sum, row) => sum + row.totalTasks, 0);
    const completedGoals = projectRows.filter((row) => row.goal.status === "completed").length;
    const blockedTasks = projectRows.reduce((sum, row) => sum + row.blockedTasks, 0);
    const completionRate = totalTasks > 0 ? Math.round((projectRows.reduce((sum, row) => sum + row.completedTasks, 0) / totalTasks) * 100) : 0;

    return { totalGoals, totalTasks, completedGoals, blockedTasks, completionRate };
  }, [projectRows]);

  return (
    <AppShell
      eyebrow="Projects"
      title="Projects, Goals, and Tasks"
      description="A structured view of how strategic goals flow into execution tasks, with direct jumps to each level of work."
      role={meQuery.data?.role}
    >
      <div className="space-y-8">
        <section className="grid gap-4 md:grid-cols-5">
          <MetricCard label="Goals" value={metrics.totalGoals} icon={<Target className="h-5 w-5" />} caption="Strategic objectives" />
          <MetricCard label="Tasks" value={metrics.totalTasks} icon={<Layers3 className="h-5 w-5" />} caption="Execution nodes" />
          <MetricCard label="Completed goals" value={metrics.completedGoals} icon={<CheckSquare className="h-5 w-5" />} caption="Delivered projects" />
          <MetricCard label="Task completion" value={`${metrics.completionRate}%`} icon={<TrendingUp className="h-5 w-5" />} caption="Goal-to-task throughput" />
          <MetricCard label="Blocked tasks" value={metrics.blockedTasks} icon={<AlertCircle className="h-5 w-5" />} caption="Items needing attention" />
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.4fr_0.6fr]">
          <Card className="border border-border bg-bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-secondary">Project map</p>
                <p className="mt-1 text-sm text-text-secondary">Every card below shows the goal, the associated tasks, and the direct navigation path into execution.</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2 rounded-full border border-border bg-bg-subtle px-3 py-2">
                  <Search className="h-4 w-4 text-text-secondary" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search goals or tasks"
                    className="h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as Goal["status"] | "all")}
                  className="h-10 rounded-xl border border-border bg-bg-surface px-3 text-sm text-text-primary"
                >
                  <option value="all">All statuses</option>
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            </div>

            <div className="mt-4 space-y-4">
              {goalsQuery.isLoading || tasksQuery.isLoading ? (
                <>
                  <Skeleton className="h-44 w-full rounded-3xl" />
                  <Skeleton className="h-44 w-full rounded-3xl" />
                  <Skeleton className="h-44 w-full rounded-3xl" />
                </>
              ) : filteredRows.length > 0 ? (
                filteredRows.map((row) => (
                  <Card key={row.goal.id} className="border border-border bg-bg-surface p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary">Goal</Badge>
                          <Badge variant={row.goal.status === "completed" ? "default" : row.goal.status === "paused" ? "secondary" : "outline"}>{row.goal.status}</Badge>
                          <Badge variant="outline">Priority {row.goal.priority}</Badge>
                          {/* Goal Creator/Manager Context */}
                          {(row.goal as any).created_by_position && (
                            <Badge className="bg-blue-50 text-blue-700 border border-blue-200">
                              📍 Created by {(row.goal as any).created_by_position}
                            </Badge>
                          )}
                        </div>
                        <div>
                          <h3 className="text-xl font-semibold text-text-primary">{row.goal.title}</h3>
                          <p className="mt-1 max-w-3xl text-sm text-text-secondary">{row.goal.description ?? row.goal.raw_input}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 rounded-2xl border border-border bg-bg-subtle p-3 text-center text-xs text-text-secondary sm:min-w-[240px] sm:grid-cols-4">
                        <div>
                          <p className="text-lg font-semibold text-text-primary">{row.totalTasks}</p>
                          <p>Tasks</p>
                        </div>
                        <div>
                          <p className="text-lg font-semibold text-text-primary">{row.completedTasks}</p>
                          <p>Done</p>
                        </div>
                        <div>
                          <p className="text-lg font-semibold text-text-primary">{row.activeTasks}</p>
                          <p>Active</p>
                        </div>
                        <div>
                          <p className="text-lg font-semibold text-text-primary">{row.blockedTasks}</p>
                          <p>Blocked</p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs text-text-secondary">
                          <span>Completion</span>
                          <span>{row.completionRate}%</span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-bg-subtle">
                          <div className="h-2 rounded-full bg-accent" style={{ width: `${row.completionRate}%` }} />
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button asChild variant="outline" className="border-border bg-bg-surface hover:bg-bg-elevated">
                          <Link href={`/dashboard/goals?expand=${row.goal.id}`}>
                            Open goal
                            <ChevronRight className="ml-2 h-4 w-4" />
                          </Link>
                        </Button>
                        <Button asChild className="bg-accent text-[#0f1115] hover:bg-accent/90">
                          <Link href={`/dashboard/task-board?goalId=${row.goal.id}`}>
                            Open task board
                            <Sparkles className="ml-2 h-4 w-4" />
                          </Link>
                        </Button>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-3 lg:grid-cols-3">
                      {row.topTasks.length > 0 ? row.topTasks.map((task) => (
                        <div key={task.id} className="rounded-2xl border border-border bg-bg-subtle p-4">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-text-primary">{task.title}</p>
                            <Badge variant="outline">{task.status}</Badge>
                          </div>
                          <p className="mt-2 text-xs text-text-secondary">{task.assigned_role.toUpperCase()} • {task.priority ?? "medium"}</p>
                          <div className="mt-3 flex items-center justify-between">
                            <span className="text-xs text-text-secondary">Task {task.id.slice(0, 8)}</span>
                            <Button asChild variant="ghost" size="sm" className="h-8 px-2 text-text-secondary hover:text-text-primary">
                              <Link href={`/dashboard/task-board?goalId=${row.goal.id}&taskId=${task.id}`}>Inspect</Link>
                            </Button>
                          </div>
                        </div>
                      )) : (
                        <div className="rounded-2xl border border-dashed border-border bg-bg-subtle p-4 text-sm text-text-secondary lg:col-span-3">
                          No tasks are linked to this goal yet.
                        </div>
                      )}
                    </div>
                  </Card>
                ))
              ) : (
                <Card className="border border-dashed border-border bg-bg-surface p-8 text-center">
                  <Sparkles className="mx-auto h-8 w-8 text-text-secondary opacity-60" />
                  <p className="mt-3 text-sm font-semibold text-text-primary">No matching projects</p>
                  <p className="mt-1 text-sm text-text-secondary">Adjust the search or status filters to find a project-goal chain.</p>
                </Card>
              )}
            </div>
          </Card>

          <div className="space-y-4">
            <Card className="border border-border bg-bg-surface p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-secondary">How this is mapped</p>
              <div className="mt-4 space-y-3 text-sm text-text-secondary">
                <p><strong className="text-text-primary">Goals</strong> define the strategic outcome.</p>
                <p><strong className="text-text-primary">Tasks</strong> are derived execution units linked by `goal_id`.</p>
                <p><strong className="text-text-primary">Projects</strong> show the consolidated view of that goal-to-task chain.</p>
              </div>
            </Card>

            <Card className="border border-border bg-bg-surface p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-secondary">Project integrity</p>
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between rounded-2xl border border-border bg-bg-subtle px-4 py-3">
                  <span className="text-sm text-text-secondary">Completion rate</span>
                  <span className="text-sm font-semibold text-text-primary">{metrics.completionRate}%</span>
                </div>
                <div className="flex items-center justify-between rounded-2xl border border-border bg-bg-subtle px-4 py-3">
                  <span className="text-sm text-text-secondary">Blocked tasks</span>
                  <span className="text-sm font-semibold text-text-primary">{metrics.blockedTasks}</span>
                </div>
                <div className="flex items-center justify-between rounded-2xl border border-border bg-bg-subtle px-4 py-3">
                  <span className="text-sm text-text-secondary">Tracked goals</span>
                  <span className="text-sm font-semibold text-text-primary">{metrics.totalGoals}</span>
                </div>
              </div>
            </Card>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function MetricCard({
  label,
  value,
  icon,
  caption
}: {
  label: string;
  value: string | number;
  icon: ReactNode;
  caption: string;
}) {
  return (
    <Card className="border border-border bg-bg-surface p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-secondary">{label}</p>
          <p className="mt-2 text-3xl font-semibold text-text-primary">{value}</p>
          <p className="mt-1 text-xs text-text-secondary">{caption}</p>
        </div>
        <div className="rounded-2xl border border-border bg-bg-subtle p-3 text-text-secondary">{icon}</div>
      </div>
    </Card>
  );
}
