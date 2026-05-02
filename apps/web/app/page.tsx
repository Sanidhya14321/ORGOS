import Link from "next/link";
import { CyberneticBentoGrid } from "@/components/ui/cybernetic-bento-grid";
import OrgosFeatures, { CustomersTableCard } from "@/components/ui/features";

export default function HomePage() {
  return (
    <div className="min-h-screen text-[var(--ink)]">
      <header className="sticky top-0 z-20 border-b border-[var(--border)]/80 bg-[rgba(252,251,248,0.82)] backdrop-blur-md">
        <nav className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--muted)]">ORGOS</p>
            <h1 className="text-lg font-semibold tracking-tight">Organizational OS</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/login" className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] transition hover:bg-[var(--surface-2)]">
              Login
            </Link>
            <Link href="/register" className="rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-white transition hover:bg-[var(--accent-hover)]">
              Executive signup
            </Link>
          </div>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-7xl space-y-10 px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <section className="dashboard-surface grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:gap-10 lg:p-10">
          <div className="dashboard-panel space-y-6 p-6 lg:p-0">
            <p className="dashboard-label">Executive workspace</p>
            <h2 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
              ORGOS is the operating system for modern organizations.
            </h2>
            <p className="max-w-2xl text-base leading-7 text-[var(--muted)] sm:text-lg">
              ORGOS combines organization design, role-aware execution, and leadership approvals in one workflow. CEOs define the hierarchy, managers coordinate delivery, workers execute clearly scoped tasks, and every report rolls up with accountability.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/dashboard" className="rounded-full bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[var(--accent-hover)]">
                Open dashboard
              </Link>
              <Link href="/dashboard/org-tree" className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-5 py-3 text-sm font-semibold transition hover:bg-[var(--surface-2)]">
                Explore org tree
              </Link>
            </div>
          </div>
          <div className="dashboard-panel space-y-4 p-6 lg:p-0">
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

      <footer className="border-t border-[var(--border)]/80 bg-[rgba(252,251,248,0.72)] backdrop-blur-md">
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
