import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { LoginForm } from "@/components/login-form";
import Link from "next/link";

export default function LoginPage() {
  return (
    <AppShell
      eyebrow="ORGOS access"
      title="Sign in to the control room"
      description="Sign in with your assigned credentials. Executives can create accounts here; employees log in with the IDs issued by their company."
    >
      <Suspense fallback={<p className="text-sm text-[var(--muted)]">Loading login form...</p>}>
        <div className="space-y-4">
          <LoginForm />
          <div className="text-center">
            <p className="text-sm text-muted-foreground">
                Don&apos;t have an account?{" "}
              <Link
                href="/register"
                className="text-primary hover:underline font-medium"
              >
                Create one here
              </Link>
            </p>
          </div>
        </div>
      </Suspense>
    </AppShell>
  );
}