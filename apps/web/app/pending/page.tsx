export default function PendingPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="dashboard-surface w-full max-w-lg p-8 text-center">
        <div className="dashboard-panel">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--success-subtle)] text-[var(--success)]">✓</div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--ink)]">You are in the queue</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
          Your request has been sent to the organization admin. You will receive an email once approved.
          </p>
        </div>
      </div>
    </main>
  );
}
