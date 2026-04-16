import Link from "next/link";
import { AppShell } from "@/components/app-shell";

export default function PendingPage() {
  return (
    <AppShell
      eyebrow="ORGOS onboarding"
      title="Approval pending"
      description="Your profile is submitted and waiting for CEO/CFO approval. You will get access once activated."
    >
      <div className="space-y-4 text-sm text-[#4b5563]">
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
            className="inline-flex items-center justify-center rounded-2xl bg-[#121826] px-4 py-3 font-semibold text-white transition hover:bg-[#1c2538]"
          >
            Back to sign in
          </Link>
          <Link
            href="/complete-profile"
            className="inline-flex items-center justify-center rounded-2xl border border-[#ddd6c8] bg-white px-4 py-3 font-semibold text-[#121826]"
          >
            Edit profile
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
