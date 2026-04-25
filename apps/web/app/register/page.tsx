import Link from "next/link";
import { RegisterWizard } from "@/components/auth/register-wizard";

export default function RegisterPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg-base p-6">
      <div className="w-full max-w-[460px] rounded-lg border border-border bg-bg-surface p-5 shadow-[0_25px_50px_rgba(0,0,0,0.6)]">
        <h1 className="text-2xl font-semibold text-accent">ORGOS</h1>
        <h2 className="mt-3 text-xl font-semibold text-text-primary">Create your account</h2>
        <p className="mt-1 text-sm text-text-secondary">Executive onboarding in 3 steps.</p>

        <div className="mt-5">
          <RegisterWizard />
        </div>

        <div className="mt-4 border-t border-border pt-4 text-center text-sm text-text-secondary">
          Already registered? <Link href="/login" className="font-medium text-accent hover:text-accent-hover">Sign in</Link>
        </div>
      </div>
    </main>
  );
}