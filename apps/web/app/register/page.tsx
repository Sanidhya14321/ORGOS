import Link from "next/link";
import { AuthPageShell } from "@/components/auth/auth-page-shell";
import { RegisterWizard } from "@/components/auth/register-wizard";

export default function RegisterPage() {
  return (
    <AuthPageShell
      eyebrow="ORGOS access"
      title="Create your account"
      description="Executive onboarding in three structured steps with organization discovery, company creation, and role placement built in."
      footer={
        <div className="text-center">
          Already registered?{" "}
          <Link href="/login" className="font-semibold text-[var(--accent)] transition hover:text-[var(--accent-hover)]">
            Sign in
          </Link>
        </div>
      }
    >
      <RegisterWizard />
    </AuthPageShell>
  );
}