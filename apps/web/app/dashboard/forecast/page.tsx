"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { AppShell } from "@/components/app-shell";
import { DashboardMetric, DashboardPageFrame, DashboardSection } from "@/components/dashboard/dashboard-surface";
import { Progress } from "@/components/ui/progress";
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
      <DashboardPageFrame
        eyebrow="Forecast panel"
        title="Delivery outlook"
        description="A compact view of effort, priority pressure, and horizon completion."
      >
        <div className="space-y-6">
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <DashboardMetric label="Open effort" value={`${forecastQuery.data?.openEffortHours ?? 0}h`} tone="info" loading={forecastQuery.isLoading} />
            <DashboardMetric label="Critical" value={`${forecastQuery.data?.byPriority.critical ?? 0}`} tone="danger" loading={forecastQuery.isLoading} />
            <DashboardMetric label="High" value={`${forecastQuery.data?.byPriority.high ?? 0}`} tone="warning" loading={forecastQuery.isLoading} />
            <DashboardMetric label="14d completion" value={`${forecastQuery.data?.forecast[1]?.expectedCompletion ?? 0}%`} tone="success" loading={forecastQuery.isLoading} />
          </section>

          <DashboardSection title="Horizon" description="Each bucket shows expected completion and remaining effort.">
            <div className="grid gap-4 lg:grid-cols-2">
              {(forecastQuery.data?.forecast ?? []).map((bucket) => (
                <article key={bucket.bucket} className="dashboard-dense-row p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="dashboard-label">{bucket.bucket}</p>
                      <p className="mt-2 text-lg font-semibold text-[var(--ink)]">{bucket.remainingHours} hours left</p>
                    </div>
                    <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-xs font-semibold text-[var(--muted)]">
                      {bucket.expectedCompletion}% expected
                    </span>
                  </div>
                  <div className="mt-4 space-y-2">
                    <Progress value={bucket.expectedCompletion} className="h-2" />
                    <p className="text-sm text-[var(--muted)]">Expected completion: {bucket.expectedCompletion}%</p>
                  </div>
                </article>
              ))}
            </div>
          </DashboardSection>
        </div>
      </DashboardPageFrame>
    </AppShell>
  );
}