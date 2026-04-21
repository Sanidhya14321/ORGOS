import Link from "next/link";
import { AppShell } from "@/components/app-shell";

export default function PendingPage() {
  return (
    <AppShell
      eyebrow="ORGOS onboarding"
      title="Approval pending"
      description="Your profile is submitted and waiting for CEO/CFO approval. You will get access once activated."
    >
      <div className="space-y-4 text-sm text-[var(--muted)]">
        <p>
          Your account is currently in pending state. An executive in your organization needs to approve your membership
          before dashboard access is enabled.
        </p>
        <p>
          If you were approved already, sign out and sign in again to refresh your session role and status claims.
        </p>
        <div className="flex gap-3">
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-2xl bg-[#f59e0b] px-4 py-3 font-semibold text-[#0f1115] transition hover:bg-[#d97706]"
          >
            Back to sign in
          </Link>
          <Link
            href="/complete-profile"
            className="inline-flex items-center justify-center rounded-2xl border border-[#2c3240] bg-[#0f1115] px-4 py-3 font-semibold text-[#eef2ff]"
          >
            Edit profile
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
