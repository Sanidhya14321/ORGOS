"use client";

import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { Task, TimeLog } from "@/lib/models";

export default function FocusPage() {
  const params = useParams<{ taskId: string }>();
  const router = useRouter();

  const taskQuery = useQuery({
    queryKey: ["focus-task", params.taskId],
    queryFn: () => apiFetch<{ items: Task[] }>(`/api/tasks?limit=200`),
    select: (data) => data.items.find((task) => task.id === params.taskId)
  });

  const logsQuery = useQuery({
    queryKey: ["focus-logs", params.taskId],
    queryFn: () => apiFetch<{ items: TimeLog[] }>(`/api/tasks/${params.taskId}/time-logs`),
    select: (data) => data.items
  });

  const startMutation = useMutation({ mutationFn: () => apiFetch(`/api/tasks/${params.taskId}/timer/start`, { method: "POST" }) });
  const stopMutation = useMutation({ mutationFn: () => apiFetch(`/api/tasks/${params.taskId}/timer/stop`, { method: "POST" }) });

  return (
    <AppShell eyebrow="Focus Mode" title={taskQuery.data?.title ?? "Task focus"} description="Single-task view with timers and history." role={undefined}>
      <div className="space-y-4">
        <Card className="space-y-4 border border-border bg-bg-surface p-4">
          <p className="text-sm text-text-secondary">{taskQuery.data?.description ?? taskQuery.data?.success_criteria}</p>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => startMutation.mutate()} disabled={startMutation.isPending}>Start timer</Button>
            <Button variant="outline" className="border-border" onClick={() => stopMutation.mutate()} disabled={stopMutation.isPending}>Stop timer</Button>
            <Button variant="ghost" onClick={() => router.push("/dashboard/inbox")}>Back to inbox</Button>
          </div>
        </Card>
        <Card className="space-y-3 border border-border bg-bg-surface p-4">
          <h2 className="text-lg font-semibold">Recent logs</h2>
          {(logsQuery.data ?? []).map((log) => (
            <div key={log.id} className="rounded-lg border border-border bg-bg-elevated p-3 text-sm">
              <p className="font-medium">{log.minutes ?? 0} minutes</p>
              <p className="text-text-secondary">{log.started_at} - {log.ended_at ?? "running"}</p>
            </div>
          ))}
        </Card>
      </div>
    </AppShell>
  );
}