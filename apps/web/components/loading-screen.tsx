import { Loader2, Sparkles, Waypoints } from "lucide-react";

type LoadingScreenProps = {
  compact?: boolean;
};

const loadingSteps = ["Auth handshake", "Org context", "Workspace sync"];

export function LoadingScreen({ compact = false }: LoadingScreenProps) {
  if (compact) {
    return (
      <div className="dashboard-panel flex flex-col items-center gap-4 py-6 text-center">
        <div className="relative flex h-16 w-16 items-center justify-center rounded-full border border-[var(--border)] bg-[rgba(252,251,248,0.92)] shadow-[0_12px_40px_rgba(23,21,19,0.08)]">
          <div className="absolute inset-0 rounded-full border border-[var(--accent)]/20 animate-ping" />
          <div className="absolute inset-2 rounded-full border border-[var(--accent)]/35 border-t-transparent animate-spin [animation-duration:1.35s]" />
          <Loader2 className="relative h-6 w-6 animate-spin text-[var(--accent)]" />
        </div>
        <div className="space-y-2">
          <p className="dashboard-label">Loading ORGOS</p>
          <p className="text-sm text-[var(--muted)]">Preparing your session and workspace state.</p>
        </div>
      </div>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center overflow-hidden p-6">
      <div className="dashboard-surface relative w-full max-w-[760px] p-8 sm:p-10">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-10 top-10 h-40 w-40 rounded-full bg-[var(--accent)]/10 blur-3xl animate-float-soft" />
          <div className="absolute right-0 top-8 h-36 w-36 rounded-full bg-[var(--warning)]/10 blur-3xl animate-float-soft [animation-delay:1.2s]" />
          <div className="absolute bottom-0 left-1/2 h-32 w-32 -translate-x-1/2 rounded-full bg-[var(--info)]/10 blur-3xl animate-float-soft [animation-delay:2.1s]" />
        </div>

        <div className="dashboard-panel grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <section className="space-y-6">
            <div className="space-y-3">
              <p className="dashboard-label">ORGOS is loading</p>
              <h1 className="text-3xl font-semibold tracking-tight text-[var(--ink)] sm:text-4xl">Preparing your workspace</h1>
              <p className="max-w-xl text-sm leading-6 text-[var(--muted)] sm:text-base">
                We are restoring authentication, syncing organizational context, and warming the live data surface before you land.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {loadingSteps.map((step, index) => (
                <div
                  key={step}
                  className="rounded-2xl border border-[var(--border)] bg-[rgba(255,255,255,0.7)] px-4 py-3 shadow-[0_8px_24px_rgba(23,21,19,0.04)] animate-rise-in"
                  style={{ animationDelay: `${index * 140}ms` }}
                >
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">
                    <Sparkles className="h-3.5 w-3.5 text-[var(--accent)]" />
                    Step {index + 1}
                  </div>
                  <p className="mt-2 text-sm font-medium text-[var(--ink)]">{step}</p>
                </div>
              ))}
            </div>
          </section>

          <aside className="dashboard-kpi space-y-6 p-5 sm:p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="dashboard-label">Status</p>
                <p className="mt-1 text-lg font-semibold text-[var(--ink)]">Synchronizing session</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--border)] bg-[rgba(255,255,255,0.8)]">
                <Waypoints className="h-5 w-5 animate-pulse text-[var(--accent)]" />
              </div>
            </div>

            <div className="space-y-3 rounded-2xl border border-[var(--border)] bg-[rgba(255,255,255,0.62)] p-4">
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">
                <span>Progress</span>
                <span>Loading</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[var(--bg-subtle)]">
                <div className="h-full w-1/2 rounded-full bg-[linear-gradient(90deg,var(--accent),var(--warning))] animate-[loadingSweep_1.8s_ease-in-out_infinite]" />
              </div>
              <p className="text-sm text-[var(--muted)]">Your access, role, and route state are being verified.</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-3 text-sm text-[var(--muted)]">
                <Loader2 className="h-4 w-4 animate-spin text-[var(--accent)]" />
                Secure handoff in progress
              </div>
              <div className="text-xs leading-5 text-[var(--text-muted)]">
                If this persists, the app is likely waiting on a network round trip or a route refresh.
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}