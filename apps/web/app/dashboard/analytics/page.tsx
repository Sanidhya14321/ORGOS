"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { AnalyticsOverview, Role } from "@/lib/models";

type MeResponse = { role: Role; org_id?: string | null };

export default function AnalyticsPage() {
  const queryClient = useQueryClient();
  const meQuery = useQuery({ queryKey: ["analytics-me"], queryFn: () => apiFetch<MeResponse>("/api/me") });
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

  return (
    <AppShell eyebrow="Analytics" title="Operational analytics" description="Track throughput, completion, and effort variance." role={meQuery.data?.role}>
      <div className="space-y-4">
        <div className="flex justify-end">
          <Button onClick={() => snapshotMutation.mutate()} disabled={snapshotMutation.isPending}>Refresh snapshot</Button>
        </div>
        <Card className="grid gap-4 border border-border bg-bg-surface p-4 md:grid-cols-3">
          <Metric label="Goals" value={`${metrics?.totalGoals ?? 0}`} />
          <Metric label="Tasks" value={`${metrics?.totalTasks ?? 0}`} />
          <Metric label="Completion" value={`${metrics?.completionRate ?? 0}%`} />
          <Metric label="Billable hours" value={`${metrics?.billableHours ?? 0}h`} />
          <Metric label="Blocked" value={`${metrics?.blockedTasks ?? 0}`} />
          <Metric label="Variance" value={`${metrics?.estimateVarianceHours ?? 0}h`} />
        </Card>
      </div>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-bg-elevated p-3">
      <p className="text-xs uppercase tracking-[0.2em] text-text-secondary">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-text-primary">{value}</p>
    </div>
  );
}