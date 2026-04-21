import Link from "next/link";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[var(--bg-main)] text-[var(--ink)]">
      <header className="border-b border-[var(--border)] bg-[var(--surface)]">
        <nav className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">ORGOS</p>
            <h1 className="text-lg font-semibold">Organizational OS</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/login" className="rounded-xl border border-[var(--border)] bg-[#0f1115] px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em]">
              Login
            </Link>
            <Link href="/register" className="rounded-xl bg-[var(--accent)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#0f1115]">
              Executive signup
            </Link>
          </div>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-7xl space-y-10 px-4 py-16 sm:px-6 lg:px-8">
        <section className="grid gap-8 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-8 lg:grid-cols-[1.2fr_0.8fr] lg:p-12">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Hero</p>
            <h2 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight lg:text-6xl">
              ORGOS is the operating system for modern organizations.
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--muted)]">
              ORGOS combines organization design, role-aware execution, and leadership approvals in one workflow. CEOs define the hierarchy, managers coordinate delivery, workers execute clearly scoped tasks, and every report rolls up with accountability.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/dashboard" className="rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-[#0f1115]">
                Open dashboard
              </Link>
              <Link href="/dashboard/org-tree" className="rounded-2xl border border-[var(--border)] bg-[#0f1115] px-4 py-3 text-sm font-semibold">
                Explore org tree
              </Link>
            </div>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[#0f1115] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">How ORGOS works</p>
            <ol className="mt-3 space-y-3 text-sm leading-6 text-[var(--ink)]">
              <li>1. Define the organization tree and position levels for your company.</li>
              <li>2. Create goals and break them into role-specific tasks.</li>
              <li>3. Route execution downward with manager accountability.</li>
              <li>4. Approve high-impact outputs at executive checkpoints.</li>
            </ol>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <article className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <h3 className="text-lg font-semibold">Organization Intelligence</h3>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Visualize reporting + department networks with dynamic levels that adapt to every company structure.</p>
          </article>
          <article className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <h3 className="text-lg font-semibold">Execution Governance</h3>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Ensure workers execute, managers coordinate, and executives approve where strategic control is required.</p>
          </article>
          <article className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <h3 className="text-lg font-semibold">Operational Clarity</h3>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Track tasks, goals, and reports in real time with role-aware dashboards and structured decision points.</p>
          </article>
        </section>
      </main>

      <footer className="border-t border-[var(--border)] bg-[var(--surface)]">
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
