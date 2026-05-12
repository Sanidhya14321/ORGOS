"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { canAccessSection } from "@/lib/access";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DashboardMetric, DashboardSection } from "@/components/dashboard/dashboard-surface";
import { Progress } from "@/components/ui/progress";
import type { ForecastResponse, Role } from "@/lib/models";

type MeResponse = { role: Role; org_id?: string | null };

export default function ForecastPage() {
  const meQuery = useQuery({ queryKey: ["forecast-me"], queryFn: () => apiFetch<MeResponse>("/api/me") });
  const canViewForecast = canAccessSection(meQuery.data?.role, "forecast");
  const forecastQuery = useQuery({
    queryKey: ["forecast", meQuery.data?.org_id],
    queryFn: () => apiFetch<ForecastResponse>(`/api/orgs/${meQuery.data?.org_id}/forecast`),
    enabled: Boolean(meQuery.data?.org_id) && canViewForecast
  });

  return (
    <AppShell eyebrow="Forecast" title="Delivery outlook" description="See how much work is open and where the pressure sits." role={meQuery.data?.role}>
      <div className="space-y-8">
        {!canViewForecast ? (
          <Card className="p-4 text-sm text-[var(--muted)]">
            Forecasting is available to CEO, CFO, and manager roles.
          </Card>
        ) : null}

        <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <Card className="p-6">
            <div className="space-y-3">
              <Badge variant="outline" className="border-border bg-bg-elevated text-text-secondary">
                Forecast engine
              </Badge>
              <h2 className="text-2xl font-semibold tracking-tight text-text-primary">
                Read future delivery pressure before it becomes today&apos;s blocker.
              </h2>
              <p className="max-w-2xl text-sm leading-7 text-text-secondary">
                Horizon buckets combine open effort, priority mix, blockers, and staffing pressure into a lighter-weight
                planning surface for executive and manager review.
              </p>
            </div>
          </Card>

          <Card className="p-6">
            <p className="dashboard-label">Planning posture</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <ForecastStat label="Open effort" value={`${forecastQuery.data?.openEffortHours ?? 0}h`} />
              <ForecastStat label="Blocked" value={forecastQuery.data?.blockedTaskCount ?? 0} />
              <ForecastStat label="Staffing" value={`${Math.round((forecastQuery.data?.staffingPressure ?? 0) * 100)}%`} />
            </div>
          </Card>
        </section>

        <div className="space-y-6">
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <DashboardMetric label="Open effort" value={`${forecastQuery.data?.openEffortHours ?? 0}h`} tone="info" loading={forecastQuery.isLoading} />
            <DashboardMetric label="Critical" value={`${forecastQuery.data?.byPriority.critical ?? 0}`} tone="danger" loading={forecastQuery.isLoading} />
            <DashboardMetric label="High" value={`${forecastQuery.data?.byPriority.high ?? 0}`} tone="warning" loading={forecastQuery.isLoading} />
            <DashboardMetric label="14d completion" value={`${forecastQuery.data?.forecast[1]?.expectedCompletion ?? 0}%`} tone="success" loading={forecastQuery.isLoading} />
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <DashboardMetric label="Blocked tasks" value={`${forecastQuery.data?.blockedTaskCount ?? 0}`} tone="warning" loading={forecastQuery.isLoading} />
            <DashboardMetric label="Staffing pressure" value={`${Math.round((forecastQuery.data?.staffingPressure ?? 0) * 100)}%`} tone="info" loading={forecastQuery.isLoading} />
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

          <DashboardSection title="Goal Risk Signals" description="Advisory signals derived from open effort, blockers, and staffing pressure.">
            <div className="grid gap-4">
              {(forecastQuery.data?.goalSignals ?? []).map((signal) => (
                <article key={signal.goalId} className="dashboard-dense-row p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="dashboard-label">{signal.title}</p>
                      <p className="mt-2 text-sm text-[var(--muted)]">{signal.remainingHours} hours remaining</p>
                    </div>
                    <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-xs font-semibold text-[var(--muted)]">
                      Risk {Math.round(signal.risk * 100)}%
                    </span>
                  </div>
                  <div className="mt-4 space-y-2">
                    <Progress value={signal.expectedCompletion14d} className="h-2" />
                    <p className="text-sm text-[var(--muted)]">Expected 14d completion: {signal.expectedCompletion14d}%</p>
                  </div>
                </article>
              ))}
            </div>
          </DashboardSection>
        </div>
      </div>
    </AppShell>
  );
}

function ForecastStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[22px] border border-border bg-bg-elevated p-4">
      <p className="dashboard-label">{label}</p>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-text-primary">{value}</p>
    </div>
  );
}