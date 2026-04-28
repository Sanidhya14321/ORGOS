"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import type { ForecastResponse, Role } from "@/lib/models";

type MeResponse = { role: Role; org_id?: string | null };

export default function ForecastPage() {
  const meQuery = useQuery({ queryKey: ["forecast-me"], queryFn: () => apiFetch<MeResponse>("/api/me") });
  const forecastQuery = useQuery({
    queryKey: ["forecast", meQuery.data?.org_id],
    queryFn: () => apiFetch<ForecastResponse>(`/api/orgs/${meQuery.data?.org_id}/forecast`),
    enabled: Boolean(meQuery.data?.org_id)
  });

  return (
    <AppShell eyebrow="Forecast" title="Delivery outlook" description="See how much work is open and where the pressure sits." role={meQuery.data?.role}>
      <div className="space-y-4">
        <Card className="grid gap-4 border border-border bg-bg-surface p-4 md:grid-cols-4">
          <Metric label="Open effort" value={`${forecastQuery.data?.openEffortHours ?? 0}h`} />
          <Metric label="Critical" value={`${forecastQuery.data?.byPriority.critical ?? 0}`} />
          <Metric label="High" value={`${forecastQuery.data?.byPriority.high ?? 0}`} />
          <Metric label="14d completion" value={`${forecastQuery.data?.forecast[1]?.expectedCompletion ?? 0}%`} />
        </Card>
        <Card className="space-y-3 border border-border bg-bg-surface p-4">
          <h2 className="text-lg font-semibold">Horizon</h2>
          {(forecastQuery.data?.forecast ?? []).map((bucket) => (
            <div key={bucket.bucket} className="rounded-lg border border-border bg-bg-elevated p-3 text-sm">
              <p className="font-medium">{bucket.bucket}</p>
              <p className="text-text-secondary">Expected completion: {bucket.expectedCompletion}%</p>
              <p className="text-text-secondary">Remaining hours: {bucket.remainingHours}</p>
            </div>
          ))}
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