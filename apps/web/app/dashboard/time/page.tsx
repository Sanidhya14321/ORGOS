"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Task, TimeLog } from "@/lib/models";

export default function TimePage() {
  const [taskId, setTaskId] = useState("");
  const [notes, setNotes] = useState("");
  const taskQuery = useQuery({
    queryKey: ["time-tasks"],
    queryFn: () => apiFetch<{ items: Task[] }>("/api/tasks?limit=40"),
    select: (data) => data.items
  });

  const logsQuery = useQuery({
    queryKey: ["time-logs", taskId],
    queryFn: () => apiFetch<{ items: TimeLog[] }>(`/api/tasks/${taskId}/time-logs`),
    select: (data) => data.items,
    enabled: Boolean(taskId)
  });

  const startMutation = useMutation({ mutationFn: () => apiFetch(`/api/tasks/${taskId}/timer/start`, { method: "POST" }) });
  const stopMutation = useMutation({ mutationFn: () => apiFetch(`/api/tasks/${taskId}/timer/stop`, { method: "POST" }) });
  const manualMutation = useMutation({
    mutationFn: () => apiFetch("/api/time-logs", { method: "POST", body: JSON.stringify({ taskId, notes, startedAt: new Date().toISOString(), source: "manual" }) })
  });

  return (
    <AppShell eyebrow="Time Tracking" title="Track real effort" description="Start a timer, stop it, or log work manually against a task." role={undefined}>
      <div className="min-w-0 grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
        <Card className="space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-border bg-bg-elevated text-text-secondary">
              Active timer
            </Badge>
            {taskId ? <Badge variant="secondary">Task selected</Badge> : null}
          </div>

          <div className="min-w-0 grid gap-3">
            <Input value={taskId} onChange={(event) => setTaskId(event.target.value)} placeholder="Paste task id or select a task below" />
            <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional notes" className="min-h-28" />
          </div>

          <div className="flex flex-wrap gap-3">
            <Button onClick={() => startMutation.mutate()} disabled={!taskId || startMutation.isPending}>Start timer</Button>
            <Button variant="outline" onClick={() => stopMutation.mutate()} disabled={!taskId || stopMutation.isPending}>Stop timer</Button>
            <Button variant="outline" onClick={() => manualMutation.mutate()} disabled={!taskId || manualMutation.isPending}>Log work</Button>
          </div>

          <div className="rounded-[22px] border border-border bg-bg-elevated p-4 text-sm leading-6 text-text-secondary">
            Use timers for active execution and manual logs for retrospective entries or backfilled effort.
          </div>
        </Card>

        <div className="min-w-0 space-y-4">
          <Card className="space-y-3 p-4">
            <h2 className="text-lg font-semibold">Tasks</h2>
          <div className="min-w-0 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {(taskQuery.data ?? []).slice(0, 12).map((task) => (
              <button
                key={task.id}
                className={`rounded-2xl border p-3 text-left transition ${taskId === task.id ? "border-accent bg-accent-subtle text-text-primary shadow-[0_12px_24px_rgba(var(--accent-rgb),0.14)]" : "border-border bg-bg-elevated hover:border-border-strong"}`}
                onClick={() => setTaskId(task.id)}
              >
                <p className="font-medium">{task.title}</p>
                <p className="text-xs text-text-secondary">{task.status}</p>
              </button>
            ))}
          </div>
          </Card>

          <Card className="space-y-3 p-4">
            <h2 className="text-lg font-semibold">Timer logs</h2>
            {(logsQuery.data ?? []).length === 0 ? <p className="text-sm text-text-secondary">Pick a task to see timer history.</p> : (logsQuery.data ?? []).map((log) => (
              <div key={log.id} className="rounded-2xl border border-border bg-bg-elevated p-4 text-sm">
                <p className="font-medium text-text-primary">{log.started_at} - {log.ended_at ?? "running"}</p>
                <p className="mt-1 text-text-secondary">{log.minutes ?? 0} minutes · {log.source}</p>
                {log.notes ? <p className="mt-2 text-text-secondary">{log.notes}</p> : null}
              </div>
            ))}
          </Card>
        </div>
      </div>
    </AppShell>
  );
}