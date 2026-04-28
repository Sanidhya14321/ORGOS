"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { AppShell } from "@/components/app-shell";
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
      <div className="space-y-4">
        <Card className="space-y-4 border border-border bg-bg-surface p-4">
          <div className="grid gap-3 md:grid-cols-[2fr_1fr]">
            <Input value={taskId} onChange={(event) => setTaskId(event.target.value)} placeholder="Paste task id or select a task below" className="border-border bg-bg-subtle" />
            <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional notes" className="border-border bg-bg-subtle" />
          </div>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => startMutation.mutate()} disabled={!taskId || startMutation.isPending}>Start timer</Button>
            <Button variant="outline" className="border-border" onClick={() => stopMutation.mutate()} disabled={!taskId || stopMutation.isPending}>Stop timer</Button>
            <Button variant="outline" className="border-border" onClick={() => manualMutation.mutate()} disabled={!taskId || manualMutation.isPending}>Log work</Button>
          </div>
        </Card>

        <Card className="space-y-3 border border-border bg-bg-surface p-4">
          <h2 className="text-lg font-semibold">Tasks</h2>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {(taskQuery.data ?? []).slice(0, 12).map((task) => (
              <button key={task.id} className="rounded-lg border border-border bg-bg-elevated p-3 text-left hover:border-accent" onClick={() => setTaskId(task.id)}>
                <p className="font-medium">{task.title}</p>
                <p className="text-xs text-text-secondary">{task.status}</p>
              </button>
            ))}
          </div>
        </Card>

        <Card className="space-y-3 border border-border bg-bg-surface p-4">
          <h2 className="text-lg font-semibold">Timer logs</h2>
          {(logsQuery.data ?? []).length === 0 ? <p className="text-sm text-text-secondary">Pick a task to see timer history.</p> : (logsQuery.data ?? []).map((log) => (
            <div key={log.id} className="rounded-lg border border-border bg-bg-elevated p-3 text-sm">
              <p className="font-medium">{log.started_at} - {log.ended_at ?? "running"}</p>
              <p className="text-text-secondary">{log.minutes ?? 0} minutes · {log.source}</p>
              <p className="text-text-secondary">{log.notes}</p>
            </div>
          ))}
        </Card>
      </div>
    </AppShell>
  );
}