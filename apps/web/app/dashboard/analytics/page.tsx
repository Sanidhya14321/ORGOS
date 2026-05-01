"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { AppShell } from "@/components/app-shell";
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

  const overviewQuery = useQuery({
    queryKey: ["analytics-overview"],
    queryFn: () => apiFetch<AnalyticsOverview>("/api/analytics/overview"),
    enabled: Boolean(meQuery.data)
  });

  const snapshotMutation = useMutation({
    mutationFn: () => apiFetch(`/api/orgs/${meQuery.data?.org_id}/analytics/snapshot`, { method: "POST" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["analytics-overview"] });
    }
  });

  const metrics = overviewQuery.data?.overview;

  if (overviewQuery.isLoading) {
    return (
      <AppShell eyebrow="Analytics" title="Operational analytics" description="Gathering latest snapshot..." role={meQuery.data?.role} showNav={false}>
        <div className="grid gap-4 md:grid-cols-3">
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
      showNav={false}
    >
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* Action Header */}
        <div className="flex justify-end">
          <Button 
            variant="outline"
            onClick={() => snapshotMutation.mutate()} 
            disabled={snapshotMutation.isPending}
            className="border-border bg-bg-surface hover:bg-bg-elevated transition-all active:scale-95"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${snapshotMutation.isPending ? 'animate-spin' : ''}`} />
            {snapshotMutation.isPending ? "Syncing..." : "Refresh Snapshot"}
          </Button>
        </div>

        {/* Bento Grid Metrics */}
        <div className="grid gap-4 md:grid-cols-3">
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

        {/* Optional: Visual Placeholder for future Knowledge Graph Analytics */}
        <div className="rounded-2xl border border-dashed border-border p-12 flex flex-col items-center justify-center text-center bg-bg-subtle/30">
          <BarChart3 className="h-10 w-10 text-text-secondary mb-4 opacity-20" />
          <p className="text-sm font-medium text-text-secondary">Historical throughput charts are being processed.</p>
          <p className="text-xs text-text-secondary/60">Updates based on the latest snapshot generation.</p>
        </div>
      </div>
    </AppShell>
  );
}

interface MetricCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  description: string;
  trend?: "positive" | "negative" | "neutral";
}

function MetricCard({ label, value, icon, description, trend }: MetricCardProps) {
  return (
    <Card className="group relative overflow-hidden border border-border bg-bg-surface p-6 transition-all hover:border-accent/50 hover:shadow-2xl hover:shadow-accent/5">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-text-secondary opacity-80">
            {label}
          </p>
          <h3 className="text-3xl font-bold text-text-primary tracking-tight">
            {value}
          </h3>
        </div>
        <div className={`p-2 rounded-xl border border-border bg-bg-subtle text-text-secondary group-hover:text-accent group-hover:border-accent/30 transition-colors`}>
          {icon}
        </div>
      </div>
      
      <div className="mt-4 flex items-center justify-between">
        <p className="text-xs text-text-secondary line-clamp-1">{description}</p>
        {trend === "positive" && <div className="h-1.5 w-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" />}
        {trend === "negative" && <div className="h-1.5 w-1.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]" />}
      </div>

      {/* Subtle Background Decorative Element */}
      <div className="absolute -right-4 -bottom-4 h-24 w-24 bg-accent/5 blur-3xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
    </Card>
  );
}