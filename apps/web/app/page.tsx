import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CyberneticBentoGrid } from "@/components/ui/cybernetic-bento-grid";
import OrgosFeatures, { CustomersTableCard } from "@/components/ui/features";

export default function HomePage() {
  return (
    <div className="min-h-screen text-[var(--ink)]">
      <header className="sticky top-0 z-20 border-b border-[var(--border)]/80 bg-[var(--surface-glass)] backdrop-blur-md">
        <nav className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--muted)]">ORGOS</p>
            <h1 className="text-lg font-semibold tracking-tight">Organizational OS</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/login">Login</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/register">Executive signup</Link>
            </Button>
          </div>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-7xl space-y-10 px-4 py-12 sm:px-6 lg:px-8 lg:space-y-12 lg:py-16">
        <section className="dashboard-surface grid gap-10 p-6 lg:grid-cols-[1.08fr_0.92fr] lg:p-10">
          <div className="dashboard-panel space-y-7">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-border bg-bg-elevated text-text-secondary">
                Executive workspace
              </Badge>
              <Badge variant="secondary">Light + dark ready</Badge>
            </div>
            <div className="space-y-5">
              <h2 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
                ORGOS is the command layer for modern organizations.
              </h2>
              <p className="max-w-2xl text-base leading-8 text-[var(--muted)] sm:text-lg">
                Bring organization design, role-aware execution, hiring, approvals, and reporting into one calm
                operational system. Leaders see the whole company, managers coordinate clearly, and workers execute
                with context.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/dashboard">Open dashboard</Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/dashboard/org-tree">Explore org tree</Link>
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ["Role-aware routing", "Execution flows adapt to CEO, CFO, manager, and worker contexts."],
                ["Hiring to delivery", "Recruitment, goals, tasks, and reports stay connected."],
                ["Operational clarity", "Minimal surfaces, denser signals, and better decision framing."]
              ].map(([title, copy]) => (
                <div key={title} className="rounded-[24px] border border-border bg-bg-surface/70 p-4">
                  <p className="text-sm font-semibold text-text-primary">{title}</p>
                  <p className="mt-2 text-sm leading-6 text-text-secondary">{copy}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="dashboard-panel space-y-4">
            <div className="rounded-[28px] border border-border bg-bg-elevated/70 p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="dashboard-label">Workspace modes</p>
                  <h3 className="mt-2 text-2xl font-semibold tracking-tight text-text-primary">Built for strategic and operational depth.</h3>
                </div>
                <div className="hidden items-center gap-2 md:flex">
                  <span className="h-3 w-3 rounded-full bg-accent" />
                  <span className="h-3 w-3 rounded-full bg-warning" />
                  <span className="h-3 w-3 rounded-full bg-info" />
                </div>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-[22px] border border-border bg-bg-surface p-4">
                  <p className="dashboard-label">Light mode</p>
                  <p className="mt-2 text-sm leading-6 text-text-secondary">
                    Warm editorial surfaces for review, planning, and onboarding.
                  </p>
                </div>
                <div className="rounded-[22px] border border-border bg-bg-base p-4">
                  <p className="dashboard-label">Dark mode</p>
                  <p className="mt-2 text-sm leading-6 text-text-secondary">
                    Low-glare dashboards for denser monitoring, triage, and control.
                  </p>
                </div>
              </div>
            </div>
            <CustomersTableCard />
            <div className="dashboard-dense-row p-5">
              <p className="dashboard-label">How ORGOS works</p>
              <ol className="mt-3 space-y-3 text-sm leading-6 text-[var(--ink)]">
                <li>1. Define the organization tree and position levels for your company.</li>
                <li>2. Create goals and break them into role-specific tasks.</li>
                <li>3. Route execution downward with manager accountability.</li>
                <li>4. Approve high-impact outputs at executive checkpoints.</li>
              </ol>
            </div>
          </div>
        </section>

        <div className="dashboard-surface p-6 lg:p-8">
          <CyberneticBentoGrid />
        </div>

        <div className="dashboard-surface p-6 lg:p-8">
          <OrgosFeatures />
        </div>
      </main>

      <footer className="border-t border-[var(--border)]/80 bg-[var(--surface-glass)] backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-6 text-sm text-[var(--muted)] sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>© 2026 ORGOS. Built for leadership and execution teams.</p>
          <div className="flex items-center gap-4">
            <Link href="/login">Login</Link>
            <Link href="/register">Register</Link>
            <Link href="/dashboard/task-board">Task board</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
