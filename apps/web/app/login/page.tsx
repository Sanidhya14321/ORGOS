import { Suspense } from "react";
import { LoginForm } from "@/components/login-form";
import Link from "next/link";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="dashboard-surface w-full max-w-[440px] p-6 sm:p-8">
        <div className="dashboard-panel mb-6 space-y-3">
          <p className="dashboard-label">ORGOS access</p>
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--ink)]">Welcome back</h1>
          <p className="text-sm leading-6 text-[var(--muted)]">Sign in to continue to your workspace and track live execution.</p>
        </div>

        <Suspense fallback={<p className="text-sm text-[var(--muted)]">Loading login form...</p>}>
          <div className="dashboard-panel space-y-5">
            <LoginForm />
            <div className="border-t border-[var(--border)] pt-4 text-center text-sm text-[var(--muted)]">
              Join organization? <Link href="/register" className="font-semibold text-[var(--accent)] hover:text-[var(--accent-hover)]">Create account</Link>
            </div>
          </div>
        </Suspense>
      </div>
    </main>
  );
}