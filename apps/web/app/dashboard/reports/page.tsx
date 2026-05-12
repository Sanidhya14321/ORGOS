"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { FileText, RefreshCw, Search, ShieldAlert, Sparkles } from "lucide-react";
import type { Report, Role, Task } from "@/lib/models";

type MeResponse = { role: Role; org_id?: string | null };

export default function ReportsPage() {
  const [query, setQuery] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const meQuery = useQuery({
    queryKey: ["reports-me"],
    queryFn: () => apiFetch<MeResponse>("/api/me")
  });

  const tasksQuery = useQuery({
    queryKey: ["reports-tasks", meQuery.data?.org_id],
    queryFn: () => apiFetch<{ items: Task[] }>("/api/tasks?limit=100"),
    select: (data) => data.items,
    enabled: Boolean(meQuery.data?.org_id)
  });

  const firstTaskId = selectedTaskId ?? tasksQuery.data?.[0]?.id ?? null;

  const reportsQuery = useQuery({
    queryKey: ["reports-list", firstTaskId],
    queryFn: () => apiFetch<{ items: Report[] }>(`/api/reports/${firstTaskId}`),
    select: (data) => data.items,
    enabled: Boolean(firstTaskId)
  });

  const filteredReports = useMemo(() => {
    const items = reportsQuery.data ?? [];
    if (!query.trim()) return items;
    const lowered = query.toLowerCase();
    return items.filter((report) =>
      report.insight.toLowerCase().includes(lowered) ||
      report.status.toLowerCase().includes(lowered)
    );
  }, [query, reportsQuery.data]);

  const loading = meQuery.isLoading || tasksQuery.isLoading || reportsQuery.isLoading;

  return (
    <AppShell
      eyebrow="Reports"
      title="Reports Dashboard"
      description="Review submitted reports, confidence levels, and escalations across the active task tree."
      role={meQuery.data?.role}
    >
      <div className="space-y-6">
        <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <Card className="p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-3">
                <Badge variant="outline" className="border-border bg-bg-elevated text-text-secondary">
                  Report review
                </Badge>
                <div className="space-y-2">
                  <h2 className="text-2xl font-semibold tracking-tight text-text-primary">
                    Review confidence, escalation pressure, and report quality by task.
                  </h2>
                  <p className="max-w-2xl text-sm leading-7 text-text-secondary">
                    Select a task on the left to inspect its report stream, then use the confidence and escalation flags
                    to decide where leadership attention is needed.
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                onClick={() => void reportsQuery.refetch()}
                disabled={reportsQuery.isFetching}
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${reportsQuery.isFetching ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </Card>

          <Card className="p-6">
            <p className="dashboard-label">Selected task state</p>
            <div className="mt-4 space-y-3">
              <div className="rounded-[22px] border border-border bg-bg-elevated px-4 py-4">
                <p className="text-sm font-semibold text-text-primary">
                  {(tasksQuery.data ?? []).find((task) => task.id === firstTaskId)?.title ?? "No task selected"}
                </p>
                <p className="mt-2 text-sm leading-6 text-text-secondary">
                  Reports stay scoped to one task at a time so status, confidence, and escalations are easy to compare.
                </p>
              </div>
            </div>
          </Card>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <Card className="p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-text-secondary">Reports</p>
            <p className="mt-2 text-3xl font-semibold text-text-primary">{reportsQuery.data?.length ?? 0}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-text-secondary">Escalations</p>
            <p className="mt-2 text-3xl font-semibold text-text-primary">{(reportsQuery.data ?? []).filter((report) => report.escalate).length}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-text-secondary">Average Confidence</p>
            <p className="mt-2 text-3xl font-semibold text-text-primary">
              {reportsQuery.data && reportsQuery.data.length > 0
                ? Math.round((reportsQuery.data.reduce((sum, report) => sum + report.confidence, 0) / reportsQuery.data.length) * 100)
                : 0}%
            </p>
          </Card>
        </section>

        <section className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <Card className="p-4">
            <div className="mb-3 flex items-center gap-2">
              <FileText className="h-4 w-4 text-text-secondary" />
              <p className="text-sm font-semibold text-text-primary">Tasks</p>
            </div>
            <div className="space-y-2">
              {tasksQuery.isLoading ? (
                <>
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </>
              ) : (
                (tasksQuery.data ?? []).slice(0, 12).map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => setSelectedTaskId(task.id)}
                    className={`w-full rounded-2xl border px-4 py-3 text-left transition ${firstTaskId === task.id ? "border-accent bg-accent-subtle text-text-primary shadow-[0_12px_24px_rgba(var(--accent-rgb),0.14)]" : "border-border bg-bg-elevated text-text-secondary hover:bg-bg-surface hover:text-text-primary"}`}
                  >
                    <p className="text-sm font-semibold">{task.title}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.18em]">{task.status}</p>
                  </button>
                ))
              )}
            </div>
          </Card>

          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-bg-surface p-3">
              <Search className="h-4 w-4 text-text-secondary" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search reports by insight or status"
                className="border-0 bg-transparent shadow-none focus-visible:ring-0"
              />
              {firstTaskId ? <Badge variant="secondary">Task linked</Badge> : null}
            </div>

            <div className="space-y-3">
              {loading ? (
                <>
                  <Skeleton className="h-32 w-full rounded-3xl" />
                  <Skeleton className="h-32 w-full rounded-3xl" />
                </>
              ) : filteredReports.length > 0 ? (
                filteredReports.map((report) => (
                  <Card key={report.id} className="p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={report.escalate ? "destructive" : report.status === "completed" ? "default" : "secondary"}>
                        {report.status}
                      </Badge>
                      {report.escalate ? <Badge variant="outline">Escalated</Badge> : null}
                      <span className="text-xs text-text-secondary">Confidence {(report.confidence * 100).toFixed(0)}%</span>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-text-primary">{report.insight}</p>
                    <div className="mt-4 flex items-center gap-2 text-xs text-text-secondary">
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>Report ID: {report.id}</span>
                    </div>
                  </Card>
                ))
              ) : (
                <Card className="border-dashed p-8 text-center text-text-secondary">
                  <ShieldAlert className="mx-auto mb-3 h-8 w-8 opacity-70" />
                  <p className="text-sm font-semibold text-text-primary">No reports found</p>
                  <p className="mt-1 text-sm">Select a task on the left or adjust the search filter.</p>
                </Card>
              )}
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}