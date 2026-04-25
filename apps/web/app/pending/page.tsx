export default function PendingPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg-base p-6">
      <div className="w-full max-w-lg rounded-lg border border-border bg-bg-surface p-8 text-center">
        <div className="mx-auto mb-4 h-10 w-10 rounded-full bg-success-subtle text-success flex items-center justify-center">✓</div>
        <h1 className="text-xl font-semibold text-text-primary">You are in the queue</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Your request has been sent to the organization admin. You will receive an email once approved.
        </p>
      </div>
    </main>
  );
}
