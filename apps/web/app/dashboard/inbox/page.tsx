"use client";

import type { ReactNode, SVGProps } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Layers, 
  Video, 
  ShieldAlert, 
  RefreshCw, 
  ArrowUpRight, 
  Clock, 
  Zap 
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AuditLogEntry, Role, Task } from "@/lib/models";

type InboxResponse = {
  items: {
    tasks: Task[];
    meetings: Array<{ 
      id: string; 
      subject: string; 
      notes?: string | null; 
      tasks_extracted: Array<{ title: string }> 
    }>;
    security: AuditLogEntry[];
  };
};

/**
 * MAIN PAGE COMPONENT
 * Must be the default export
 */
export default function InboxPage() {
  const queryClient = useQueryClient();
  
  const inboxQuery = useQuery({
    queryKey: ["inbox"],
    queryFn: () => apiFetch<InboxResponse>("/api/inbox")
  });

  const refreshMutation = useMutation({ 
    mutationFn: () => apiFetch("/api/inbox"), 
    onSuccess: async () => { 
      await queryClient.invalidateQueries({ queryKey: ["inbox"] }); 
    } 
  });

  const tasks = inboxQuery.data?.items.tasks ?? [];
  const meetings = inboxQuery.data?.items.meetings ?? [];
  const security = inboxQuery.data?.items.security ?? [];

  if (inboxQuery.isLoading) {
    return (
      <AppShell eyebrow="Inbox" title="Syncing Intelligence" description="Gathering latest node updates..." role={undefined}>
        <div className="min-w-0 space-y-8">
          <Skeleton className="h-24 w-full rounded-2xl bg-bg-subtle" />
          <div className="min-w-0 grid gap-6 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-96 w-full rounded-2xl bg-bg-subtle" />
            ))}
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell 
      eyebrow="Inbox" 
      title="Work Orchestration" 
      description="Manage pending execution nodes, intelligence syncs, and system audit events." 
      role={undefined as Role | undefined}
    >
      <div className="min-w-0 space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <section className="min-w-0 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <Card className="p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-3">
                <Badge variant="outline" className="border-border bg-bg-elevated text-text-secondary">
                  Live queue
                </Badge>
                <div className="space-y-2">
                  <h2 className="text-2xl font-semibold tracking-tight text-text-primary">
                    Triage execution, intelligence imports, and audit signals from one surface.
                  </h2>
                  <p className="max-w-2xl text-sm leading-7 text-text-secondary">
                    The inbox is your operating queue. Resolve work items, review imported meeting follow-ups, and scan
                    security events before they turn into execution friction.
                  </p>
                </div>
              </div>

              <Button 
                variant="outline" 
                onClick={() => refreshMutation.mutate()}
                disabled={refreshMutation.isPending}
              >
                <RefreshCw className={cn("mr-2 h-4 w-4", refreshMutation.isPending && "animate-spin")} />
                Refresh Snapshot
              </Button>
            </div>
          </Card>

          <div className="min-w-0 grid gap-4">
            <Card className="p-5">
              <p className="dashboard-label">Queue health</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <QueueStat label="Pending tasks" value={tasks.length} />
                <QueueStat label="Imported syncs" value={meetings.length} />
                <QueueStat label="Audit signals" value={security.length} />
              </div>
            </Card>
          </div>
        </section>

        <div className="min-w-0 grid grid-cols-1 gap-4 sm:grid-cols-4">
          <SummaryCard label="Operational Nodes" value={tasks.length} tone="info" icon={<Layers className="h-4 w-4" />} />
          <SummaryCard label="Intelligence Syncs" value={meetings.length} tone="success" icon={<Video className="h-4 w-4" />} />
          <SummaryCard label="Audit Events" value={security.length} tone="danger" icon={<ShieldAlert className="h-4 w-4" />} />
          
          <div className="flex items-center justify-end">
            <Button 
              variant="outline" 
              className="w-full h-full text-[10px] font-bold uppercase tracking-widest py-6" 
              onClick={() => refreshMutation.mutate()}
              disabled={refreshMutation.isPending}
            >
              <RefreshCw className={cn("mr-2 h-4 w-4", refreshMutation.isPending && "animate-spin")} />
              Refresh Snapshot
            </Button>
          </div>
        </div>

        <div className="min-w-0 grid gap-8 items-start lg:grid-cols-3">
          <InboxColumn
            title="Tasks"
            subtitle="Pending execution"
            accentClass="bg-accent"
          >
            <div className="space-y-3">
              {tasks.length === 0 ? (
                <EmptyNode message="Nodes Nominal" />
              ) : (
                tasks.map((task) => (
                  <InboxCard key={task.id}>
                    <div className="flex justify-between items-start gap-3">
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-text-primary tracking-tight leading-tight">{task.title}</p>
                        <div className="flex items-center gap-2">
                           <StatusBadge status={task.status}>{task.status}</StatusBadge>
                           <p className="text-[9px] font-bold text-text-secondary uppercase tracking-widest">{task.priority ?? "medium"}</p>
                        </div>
                      </div>
                      <Link href={`/dashboard/focus/${task.id}`} className="shrink-0 flex h-9 w-9 items-center justify-center rounded-2xl border border-border bg-bg-elevated text-text-secondary transition-all hover:text-accent">
                        <ArrowUpRight className="h-4 w-4" />
                      </Link>
                    </div>
                  </InboxCard>
                ))
              )}
            </div>
          </InboxColumn>

          <InboxColumn
            title="Meetings"
            subtitle="Intelligence sync"
            accentClass="bg-info"
          >
            <div className="space-y-3">
              {meetings.length === 0 ? (
                <EmptyNode message="Syncs Complete" />
              ) : (
                meetings.map((meeting) => (
                  <InboxCard key={meeting.id}>
                    <p className="mb-4 text-sm font-bold text-text-primary tracking-tight leading-tight">{meeting.subject}</p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-info">
                        <Zap className="h-3.5 w-3.5" />
                        <span className="text-[10px] font-bold uppercase tracking-widest">{meeting.tasks_extracted.length} Follow-ups</span>
                      </div>
                      <div className="text-[9px] font-bold text-text-secondary uppercase tracking-widest">Imported</div>
                    </div>
                  </InboxCard>
                ))
              )}
            </div>
          </InboxColumn>

          <InboxColumn
            title="Security"
            subtitle="System audit"
            accentClass="bg-danger"
          >
            <div className="space-y-3">
              {security.length === 0 ? (
                <EmptyNode message="Audit Nominal" />
              ) : (
                security.map((entry) => (
                  <InboxCard key={entry.id}>
                    <div className="flex items-start gap-3">
                       <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-danger-subtle text-danger">
                         <ShieldAlert className="h-4 w-4" />
                       </div>
                       <div className="min-w-0">
                         <p className="text-xs font-bold text-text-primary uppercase tracking-tight truncate">{entry.action}</p>
                         <p className="text-[10px] text-text-secondary truncate mt-0.5">{entry.entity}</p>
                       </div>
                    </div>
                    <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-[9px] font-bold uppercase tracking-widest text-text-secondary">
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3 w-3" />
                        {entry.created_at}
                      </div>
                      <AlertCircleIcon className="h-3 w-3 opacity-30" />
                    </div>
                  </InboxCard>
                ))
              )}
            </div>
          </InboxColumn>
        </div>
      </div>
    </AppShell>
  );
}

/* --- Internal Visual Components --- */

function SummaryCard({ label, value, icon, tone }: { label: string; value: number; icon: ReactNode; tone: "info" | "success" | "danger" }) {
  const toneColor = {
    info: "text-accent bg-accent-subtle",
    success: "text-success bg-success-subtle",
    danger: "text-danger bg-danger-subtle",
  }[tone];

  return (
    <Card className="flex min-w-0 flex-col justify-between p-4">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">{label}</p>
        <div className={cn("p-1.5 rounded-lg", toneColor)}>{icon}</div>
      </div>
      <p className="mt-4 text-3xl font-bold text-text-primary tracking-tighter">{value}</p>
    </Card>
  );
}

function InboxCard({ children }: { children: ReactNode }) {
  return (
    <Card className="p-4 transition-all hover:-translate-y-0.5">
      {children}
    </Card>
  );
}

function EmptyNode({ message }: { message: string }) {
  return (
    <div className="flex h-24 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-bg-elevated/60 grayscale opacity-50">
      <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-text-secondary italic">{message}</p>
    </div>
  );
}

function StatusBadge({ children, status }: { children: React.ReactNode, status: string }) {
  const color = status === "completed" ? "bg-success-subtle text-success" : "bg-accent-subtle text-accent";
  return (
    <span className={cn("rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-tight", color)}>
      {children}
    </span>
  );
}

function QueueStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[22px] border border-border bg-bg-elevated p-4">
      <p className="dashboard-label">{label}</p>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-text-primary">{value}</p>
    </div>
  );
}

function InboxColumn({
  title,
  subtitle,
  accentClass,
  children
}: {
  title: string;
  subtitle: string;
  accentClass: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-6">
      <div className="flex items-center gap-3">
        <span className={cn("h-10 w-1.5 rounded-full", accentClass)} />
        <div className="space-y-1">
          <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-text-primary">{title}</h2>
          <p className="text-[10px] font-bold uppercase tracking-widest text-text-secondary opacity-70">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function AlertCircleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}