"use client";

import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { canAccessSection } from "@/lib/access";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  BarChart3, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  TrendingDown, 
  RefreshCw,
  Zap,
  Target,
  Layers
} from "lucide-react";
import type { AnalyticsOverview, Role } from "@/lib/models";

type MeResponse = { role: Role; org_id?: string | null };

export default function AnalyticsPage() {
  const queryClient = useQueryClient();
  
  const meQuery = useQuery({ 
    queryKey: ["analytics-me"], 
    queryFn: () => apiFetch<MeResponse>("/api/me") 
  });
  const canViewAnalytics = canAccessSection(meQuery.data?.role, "analytics");

  const overviewQuery = useQuery({
    queryKey: ["analytics-overview"],
    queryFn: () => apiFetch<AnalyticsOverview>("/api/analytics/overview"),
    enabled: Boolean(meQuery.data) && canViewAnalytics
  });

  const snapshotMutation = useMutation({
    mutationFn: () => apiFetch(`/api/orgs/${meQuery.data?.org_id}/analytics/snapshot`, { method: "POST" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["analytics-overview"] });
    }
  });

  const metrics = overviewQuery.data?.overview;
  const analyticsHighlights = [
    {
      label: "Completion posture",
      value: `${metrics?.completionRate ?? 0}%`,
      description: "Delivery ratio across currently tracked work."
    },
    {
      label: "Blocked pressure",
      value: `${metrics?.blockedTasks ?? 0}`,
      description: "Execution items currently waiting on intervention."
    },
    {
      label: "Effort variance",
      value: `${metrics?.estimateVarianceHours ?? 0}h`,
      description: "Difference between planned and actual effort."
    }
  ];

  if (overviewQuery.isLoading) {
    return (
      <AppShell eyebrow="Analytics" title="Operational analytics" description="Gathering latest snapshot..." role={meQuery.data?.role}>
        <div className="min-w-0 grid gap-4 md:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-2xl bg-bg-subtle" />
          ))}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell 
      eyebrow="Analytics" 
      title="Operational Analytics" 
      description="Track throughput, completion, and effort variance across your digital estate." 
      role={meQuery.data?.role}
    >
      <div className="min-w-0 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {!canViewAnalytics ? (
          <Card className="p-5 text-sm text-text-secondary">
            Analytics are available to CEO, CFO, and manager roles.
          </Card>
        ) : null}

        <section className="min-w-0 grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
          <Card className="min-w-0 p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-3">
                <Badge variant="outline" className="border-border bg-bg-elevated text-text-secondary">
                  Live snapshot
                </Badge>
                <div className="space-y-2">
                  <h2 className="text-2xl font-semibold tracking-tight text-text-primary">
                    Read the health of execution before you zoom into individual work.
                  </h2>
                  <p className="max-w-2xl text-sm leading-7 text-text-secondary">
                    This surface summarizes strategy coverage, delivery throughput, blocked pressure, and estimate drift
                    so leadership can react earlier.
                  </p>
                </div>
              </div>

              <Button 
                variant="outline"
                onClick={() => snapshotMutation.mutate()} 
                disabled={!canViewAnalytics || snapshotMutation.isPending}
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${snapshotMutation.isPending ? 'animate-spin' : ''}`} />
                {snapshotMutation.isPending ? "Syncing..." : "Refresh Snapshot"}
              </Button>
            </div>
          </Card>

          <div className="min-w-0 grid gap-4">
            {analyticsHighlights.map((item) => (
              <Card key={item.label} className="p-5">
                <p className="dashboard-label">{item.label}</p>
                <p className="mt-3 text-2xl font-semibold tracking-tight text-text-primary">{item.value}</p>
                <p className="mt-2 text-sm leading-6 text-text-secondary">{item.description}</p>
              </Card>
            ))}
          </div>
        </section>

        <div className="min-w-0 grid gap-4 md:grid-cols-3">
          <MetricCard 
            label="Total Goals" 
            value={metrics?.totalGoals ?? 0} 
            icon={<Target className="h-5 w-5" />}
            description="Active strategic objectives"
          />
          <MetricCard 
            label="Total Tasks" 
            value={metrics?.totalTasks ?? 0} 
            icon={<Layers className="h-5 w-5" />}
            description="Autonomous work units"
          />
          <MetricCard 
            label="Completion Rate" 
            value={`${metrics?.completionRate ?? 0}%`} 
            icon={<CheckCircle2 className="h-5 w-5" />}
            description="SLA-aligned delivery"
            trend="positive"
          />
          <MetricCard 
            label="Billable Effort" 
            value={`${metrics?.billableHours ?? 0}h`} 
            icon={<Zap className="h-5 w-5" />}
            description="Direct resource allocation"
          />
          <MetricCard 
            label="Blocked Nodes" 
            value={metrics?.blockedTasks ?? 0} 
            icon={<AlertTriangle className="h-5 w-5" />}
            description="Critical path impediments"
            trend={metrics?.blockedTasks && metrics.blockedTasks > 0 ? "negative" : "neutral"}
          />
          <MetricCard 
            label="Estimate Variance" 
            value={`${metrics?.estimateVarianceHours ?? 0}h`} 
            icon={<Clock className="h-5 w-5" />}
            description="Deviation from projected effort"
          />
        </div>

        <section className="min-w-0 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <Card className="flex flex-col items-center justify-center border-dashed p-12 text-center">
            <BarChart3 className="mb-4 h-10 w-10 text-text-secondary opacity-30" />
            <p className="text-sm font-medium text-text-secondary">Historical throughput charts are being processed.</p>
            <p className="mt-1 text-xs text-text-muted">Updates appear after the latest snapshot generation completes.</p>
          </Card>

          <Card className="p-6">
            <p className="dashboard-label">Interpretation guide</p>
            <div className="mt-4 space-y-4 text-sm leading-6 text-text-secondary">
              <div>
                <p className="font-semibold text-text-primary">Completion rate</p>
                <p>High completion with low variance indicates the execution model is matching the current planning horizon.</p>
              </div>
              <div>
                <p className="font-semibold text-text-primary">Blocked nodes</p>
                <p>Blocked work is the clearest signal that routing, dependencies, or approvals need leadership attention.</p>
              </div>
              <div>
                <p className="font-semibold text-text-primary">Billable effort</p>
                <p>Use billable hours and task count together to identify whether throughput is expanding efficiently.</p>
              </div>
            </div>
          </Card>
        </section>
      </div>
    </AppShell>
  );
}

interface MetricCardProps {
  label: string;
  value: string | number;
  icon: ReactNode;
  description: string;
  trend?: "positive" | "negative" | "neutral";
}

function MetricCard({ label, value, icon, description, trend }: MetricCardProps) {
  return (
    <Card className="group relative min-w-0 overflow-hidden p-6 transition-all hover:-translate-y-0.5">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-text-secondary opacity-80">
            {label}
          </p>
          <h3 className="text-3xl font-bold text-text-primary tracking-tight">
            {value}
          </h3>
        </div>
        <div className="rounded-2xl border border-border bg-bg-subtle p-2.5 text-text-secondary transition-colors group-hover:text-accent">
          {icon}
        </div>
      </div>
      
      <div className="mt-4 flex items-center justify-between">
        <p className="text-xs text-text-secondary line-clamp-1">{description}</p>
        {trend === "positive" && <div className="h-1.5 w-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" />}
        {trend === "negative" && <div className="h-1.5 w-1.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]" />}
      </div>
    </Card>
  );
}