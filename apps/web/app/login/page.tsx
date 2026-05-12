import { Suspense } from "react";
import { LoginForm } from "@/components/login-form";
import Link from "next/link";
import { LoadingScreen } from "@/components/loading-screen";
import { AuthPageShell } from "@/components/auth/auth-page-shell";

export default function LoginPage() {
  return (
    <AuthPageShell
      eyebrow="ORGOS access"
      title="Welcome back"
      description="Sign in to continue to your workspace, review live execution, and pick up the next decision with full org context."
      footer={
        <div className="text-center">
          Join organization?{" "}
          <Link href="/register" className="font-semibold text-[var(--accent)] transition hover:text-[var(--accent-hover)]">
            Create account
          </Link>
        </div>
      }
    >
        <Suspense fallback={<LoadingScreen compact />}>
          <LoginForm />
        </Suspense>
    </AuthPageShell>
  );
}