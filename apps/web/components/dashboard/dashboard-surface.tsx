import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type DashboardPageFrameProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
};

type DashboardSectionProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
};

type DashboardMetricProps = {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
  loading?: boolean;
};

const toneClassNames: Record<NonNullable<DashboardMetricProps["tone"]>, string> = {
  neutral: "bg-bg-subtle text-text-secondary",
  success: "bg-success-subtle text-success",
  warning: "bg-warning-subtle text-warning",
  danger: "bg-danger-subtle text-danger",
  info: "bg-info-subtle text-info"
};

export function DashboardPageFrame({ eyebrow, title, description, actions, children, className }: DashboardPageFrameProps) {
  return (
    <div className={cn("space-y-7 animate-rise-in", className)}>
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-4xl space-y-4">
          {eyebrow ? <p className="dashboard-label">{eyebrow}</p> : null}
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--ink)] sm:text-4xl lg:text-[3.4rem]">{title}</h1>
          {description ? <p className="max-w-3xl text-sm leading-7 text-[var(--muted)] sm:text-base">{description}</p> : null}
        </div>

        {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
      </header>

      <section className="dashboard-surface">
        <div className="dashboard-panel p-5 sm:p-6 lg:p-8 xl:p-10">{children}</div>
      </section>
    </div>
  );
}

export function DashboardSection({ title, description, actions, children, className }: DashboardSectionProps) {
  return (
    <section className={cn("space-y-4", className)}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight text-[var(--ink)] sm:text-[1.35rem]">{title}</h2>
          {description ? <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--muted)]">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function DashboardMetric({ label, value, hint, tone = "neutral", loading = false }: DashboardMetricProps) {
  if (loading) {
    return (
      <article className="dashboard-kpi p-4 sm:p-5">
        <Skeleton className="h-3.5 w-24 bg-[var(--bg-subtle)]" />
        <Skeleton className="mt-4 h-10 w-28 bg-[var(--bg-subtle)]" />
        <Skeleton className="mt-3 h-4 w-40 bg-[var(--bg-subtle)]" />
      </article>
    );
  }

  return (
    <article className="dashboard-kpi p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="dashboard-label">{label}</p>
        <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]", toneClassNames[tone])}>
          {tone}
        </span>
      </div>
      <p className="mt-4 text-3xl font-semibold tracking-tight text-[var(--ink)]">{value}</p>
      {hint ? <p className="mt-2 text-sm text-[var(--muted)]">{hint}</p> : null}
    </article>
  );
}