"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { AuditLogEntry, Role, Task } from "@/lib/models";

type InboxResponse = {
  items: {
    tasks: Task[];
    meetings: Array<{ id: string; subject: string; notes?: string | null; tasks_extracted: Array<{ title: string }> }>;
    security: AuditLogEntry[];
  };
};

export default function InboxPage() {
  const queryClient = useQueryClient();
  const inboxQuery = useQuery({
    queryKey: ["inbox"],
    queryFn: () => apiFetch<InboxResponse>("/api/inbox")
  });

  const refreshMutation = useMutation({ mutationFn: () => apiFetch("/api/inbox") , onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["inbox"] }); } });

  const tasks = inboxQuery.data?.items.tasks ?? [];
  const meetings = inboxQuery.data?.items.meetings ?? [];
  const security = inboxQuery.data?.items.security ?? [];

  return (
    <AppShell eyebrow="Inbox" title="Work waiting for you" description="Pending tasks, imported meetings, and the latest security events in one view." role={undefined as Role | undefined} showNav={false}>
      <div className="space-y-4">
        <div className="flex justify-end">
          <Button variant="outline" className="border-border" onClick={() => refreshMutation.mutate()}>Refresh</Button>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="space-y-3 border border-border bg-bg-surface p-4">
            <h2 className="text-lg font-semibold">Tasks</h2>
            {tasks.length === 0 ? <p className="text-sm text-text-secondary">Nothing assigned right now.</p> : tasks.map((task) => (
              <div key={task.id} className="rounded-lg border border-border bg-bg-elevated p-3">
                <p className="font-medium">{task.title}</p>
                <p className="text-xs text-text-secondary">{task.status} · {task.priority ?? "medium"}</p>
                <Link className="mt-2 inline-block text-sm text-accent" href={`/dashboard/focus/${task.id}`}>Focus mode</Link>
              </div>
            ))}
          </Card>
          <Card className="space-y-3 border border-border bg-bg-surface p-4">
            <h2 className="text-lg font-semibold">Meetings</h2>
            {meetings.length === 0 ? <p className="text-sm text-text-secondary">No imported meetings yet.</p> : meetings.map((meeting) => (
              <div key={meeting.id} className="rounded-lg border border-border bg-bg-elevated p-3">
                <p className="font-medium">{meeting.subject}</p>
                <p className="text-xs text-text-secondary">{meeting.tasks_extracted.length} extracted follow-ups</p>
              </div>
            ))}
          </Card>
          <Card className="space-y-3 border border-border bg-bg-surface p-4">
            <h2 className="text-lg font-semibold">Security</h2>
            {security.length === 0 ? <p className="text-sm text-text-secondary">No security events logged yet.</p> : security.map((entry) => (
              <div key={entry.id} className="rounded-lg border border-border bg-bg-elevated p-3">
                <p className="font-medium">{entry.action}</p>
                <p className="text-xs text-text-secondary">{entry.entity} · {entry.created_at}</p>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </AppShell>
  );
}