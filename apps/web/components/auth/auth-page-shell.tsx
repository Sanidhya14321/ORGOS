import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";

type AuthPageShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
};

const HIGHLIGHTS = [
  "Role-aware execution and reporting in one workspace",
  "Executive-safe routing for approvals, hiring, and org design",
  "Live light and dark themes across the new control surfaces"
];

export function AuthPageShell({ eyebrow, title, description, children, footer }: AuthPageShellProps) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-10">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_top_left,rgba(var(--accent-rgb),0.12),transparent_42%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-72 w-72 rounded-full bg-warning/10 blur-3xl" />

      <div className="relative grid w-full max-w-6xl gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <section className="dashboard-surface hidden p-8 xl:block xl:p-10">
          <div className="dashboard-panel flex h-full flex-col justify-between gap-10">
            <div className="space-y-6">
              <Badge variant="outline" className="w-fit border-border bg-bg-elevated text-text-secondary">
                ORGOS workspace
              </Badge>
              <div className="space-y-4">
                <p className="dashboard-label">Executive operating system</p>
                <h2 className="max-w-xl text-4xl font-semibold leading-tight tracking-tight text-text-primary">
                  A calmer command layer for strategy, execution, and organizational design.
                </h2>
                <p className="max-w-xl text-base leading-7 text-text-secondary">
                  ORGOS connects goals, roles, approvals, and operational visibility in a single system built
                  for modern leadership teams.
                </p>
              </div>
            </div>

            <div className="grid gap-4">
              {HIGHLIGHTS.map((highlight) => (
                <div key={highlight} className="rounded-[24px] border border-border bg-bg-surface/70 px-5 py-4">
                  <p className="text-sm font-medium leading-6 text-text-primary">{highlight}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="dashboard-surface p-6 sm:p-8 lg:p-10">
          <div className="dashboard-panel space-y-8">
            <div className="space-y-4">
              <p className="dashboard-label">{eyebrow}</p>
              <div className="space-y-3">
                <h1 className="text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">{title}</h1>
                <p className="max-w-xl text-sm leading-7 text-text-secondary sm:text-base">{description}</p>
              </div>
            </div>

            <div className="space-y-6">{children}</div>
            {footer ? <div className="border-t border-border pt-5 text-sm text-text-secondary">{footer}</div> : null}
          </div>
        </section>
      </div>
    </main>
  );
}
