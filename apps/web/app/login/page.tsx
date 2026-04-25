import { Suspense } from "react";
import { LoginForm } from "@/components/login-form";
import Link from "next/link";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg-base p-6">
      <div className="w-full max-w-[400px] rounded-lg border border-border bg-bg-surface p-5 shadow-[0_25px_50px_rgba(0,0,0,0.6)]">
        <div className="mb-5">
          <h1 className="text-2xl font-semibold text-accent">ORGOS</h1>
          <h2 className="mt-3 text-xl font-semibold text-text-primary">Welcome back</h2>
          <p className="mt-1 text-sm text-text-secondary">Sign in to continue.</p>
        </div>

        <Suspense fallback={<p className="text-sm text-text-secondary">Loading login form...</p>}>
          <div className="space-y-4">
            <LoginForm />
            <div className="border-t border-border pt-4 text-center text-sm text-text-secondary">
              Join organization? <Link href="/register" className="font-medium text-accent hover:text-accent-hover">Create account</Link>
            </div>
          </div>
        </Suspense>
      </div>
    </main>
  );
}