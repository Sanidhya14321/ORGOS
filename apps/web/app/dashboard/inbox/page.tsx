"use client";

import React, { Fragment } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
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
        <div className="space-y-8">
          <Skeleton className="h-24 w-full rounded-2xl bg-bg-subtle" />
          <div className="grid gap-6 lg:grid-cols-3">
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
      <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
        
        {/* Section 1: Executive Summary Row */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <SummaryCard label="Operational Nodes" value={tasks.length} tone="info" icon={<Layers className="h-4 w-4" />} />
          <SummaryCard label="Intelligence Syncs" value={meetings.length} tone="success" icon={<Video className="h-4 w-4" />} />
          <SummaryCard label="Audit Events" value={security.length} tone="danger" icon={<ShieldAlert className="h-4 w-4" />} />
          
          <div className="flex items-center justify-end">
            <Button 
              variant="outline" 
              className="w-full h-full border-border bg-bg-surface hover:bg-bg-elevated transition-all text-[10px] font-bold uppercase tracking-widest py-6" 
              onClick={() => refreshMutation.mutate()}
              disabled={refreshMutation.isPending}
            >
              <RefreshCw className={cn("mr-2 h-4 w-4", refreshMutation.isPending && "animate-spin")} />
              Refresh Snapshot
            </Button>
          </div>
        </div>

        {/* Section 2: Main Content (Vertical Flow) */}
        <div className="grid gap-8 lg:grid-cols-3 items-start">
          
          {/* Column: Tasks */}
          <div className="space-y-6">
            <header className="space-y-1 border-l-2 border-accent pl-4">
              <h2 className="text-sm font-bold text-text-primary uppercase tracking-[0.2em]">Tasks</h2>
              <p className="text-[10px] text-text-secondary font-bold uppercase tracking-widest opacity-60">Pending Execution</p>
            </header>
            
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
                      <Link href={`/dashboard/focus/${task.id}`} className="shrink-0 h-8 w-8 rounded-lg bg-bg-subtle border border-border flex items-center justify-center text-text-secondary hover:text-accent hover:border-accent transition-all">
                        <ArrowUpRight className="h-4 w-4" />
                      </Link>
                    </div>
                  </InboxCard>
                ))
              )}
            </div>
          </div>

          {/* Column: Meetings */}
          <div className="space-y-6">
            <header className="space-y-1 border-l-2 border-blue-500 pl-4">
              <h2 className="text-sm font-bold text-text-primary uppercase tracking-[0.2em]">Meetings</h2>
              <p className="text-[10px] text-text-secondary font-bold uppercase tracking-widest opacity-60">Intelligence Sync</p>
            </header>

            <div className="space-y-3">
              {meetings.length === 0 ? (
                <EmptyNode message="Syncs Complete" />
              ) : (
                meetings.map((meeting) => (
                  <InboxCard key={meeting.id}>
                    <p className="text-sm font-bold text-text-primary tracking-tight leading-tight mb-4">{meeting.subject}</p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-blue-500">
                        <Zap className="h-3.5 w-3.5" />
                        <span className="text-[10px] font-bold uppercase tracking-widest">{meeting.tasks_extracted.length} Follow-ups</span>
                      </div>
                      <div className="text-[9px] font-bold text-text-secondary uppercase tracking-widest">Imported</div>
                    </div>
                  </InboxCard>
                ))
              )}
            </div>
          </div>

          {/* Column: Security */}
          <div className="space-y-6">
            <header className="space-y-1 border-l-2 border-red-500 pl-4">
              <h2 className="text-sm font-bold text-text-primary uppercase tracking-[0.2em]">Security</h2>
              <p className="text-[10px] text-text-secondary font-bold uppercase tracking-widest opacity-60">System Audit</p>
            </header>

            <div className="space-y-3">
              {security.length === 0 ? (
                <EmptyNode message="Audit Nominal" />
              ) : (
                security.map((entry) => (
                  <InboxCard key={entry.id}>
                    <div className="flex items-start gap-3">
                       <div className="h-8 w-8 rounded-lg bg-red-500/10 flex items-center justify-center text-red-500 shrink-0">
                         <ShieldAlert className="h-4 w-4" />
                       </div>
                       <div className="min-w-0">
                         <p className="text-xs font-bold text-text-primary uppercase tracking-tight truncate">{entry.action}</p>
                         <p className="text-[10px] text-text-secondary truncate mt-0.5">{entry.entity}</p>
                       </div>
                    </div>
                    <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-[9px] font-bold text-text-secondary uppercase tracking-widest">
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
          </div>
        </div>
      </div>
    </AppShell>
  );
}

/* --- Internal Visual Components --- */

function SummaryCard({ label, value, icon, tone }: { label: string; value: number; icon: React.ReactNode; tone: "info" | "success" | "danger" }) {
  const toneColor = {
    info: "text-accent bg-accent/10",
    success: "text-green-500 bg-green-500/10",
    danger: "text-red-500 bg-red-500/10",
  }[tone];

  return (
    <div className="p-4 rounded-2xl border border-border bg-bg-surface flex flex-col justify-between hover:border-text-secondary/30 transition-all">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">{label}</p>
        <div className={cn("p-1.5 rounded-lg", toneColor)}>{icon}</div>
      </div>
      <p className="mt-4 text-3xl font-bold text-text-primary tracking-tighter">{value}</p>
    </div>
  );
}

function InboxCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-4 rounded-xl border border-border bg-bg-surface transition-all hover:bg-bg-subtle/40 hover:border-text-secondary/20">
      {children}
    </div>
  );
}

function EmptyNode({ message }: { message: string }) {
  return (
    <div className="h-24 rounded-xl border border-dashed border-border flex flex-col items-center justify-center bg-bg-subtle/20 grayscale opacity-40">
      <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-text-secondary italic">{message}</p>
    </div>
  );
}

function StatusBadge({ children, status }: { children: React.ReactNode, status: string }) {
  const color = status === "completed" ? "bg-green-500/10 text-green-500" : "bg-accent/10 text-accent";
  return (
    <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-tight", color)}>
      {children}
    </span>
  );
}

function AlertCircleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}