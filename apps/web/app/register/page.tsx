import Link from "next/link";
import { RegisterWizard } from "@/components/auth/register-wizard";

export default function RegisterPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="dashboard-surface w-full max-w-[500px] p-6 sm:p-8">
        <p className="dashboard-label">ORGOS access</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--ink)]">Create your account</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Executive onboarding in three steps with organization selection built in.</p>

        <div className="mt-6 dashboard-panel">
          <RegisterWizard />
        </div>

        <div className="mt-5 border-t border-[var(--border)] pt-4 text-center text-sm text-[var(--muted)]">
          Already registered? <Link href="/login" className="font-semibold text-[var(--accent)] hover:text-[var(--accent-hover)]">Sign in</Link>
        </div>
      </div>
    </main>
  );
}