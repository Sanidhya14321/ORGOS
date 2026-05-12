import Link from "next/link";
import { AuthPageShell } from "@/components/auth/auth-page-shell";
import { Button } from "@/components/ui/button";

export default function PendingPage() {
  return (
    <AuthPageShell
      eyebrow="ORGOS onboarding"
      title="You are in the approval queue"
      description="Your request has been sent to the organization admin. You will receive an email as soon as your access is approved."
      footer={
        <div className="text-center">
          Already approved?{" "}
          <Link href="/login" className="font-semibold text-[var(--accent)] underline-offset-4 hover:underline">
            Return to sign in
          </Link>
        </div>
      }
    >
      <div className="space-y-4 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-border bg-success-subtle text-success">
          ✓
        </div>
        <div className="rounded-2xl border border-border bg-bg-elevated px-4 py-4 text-sm leading-6 text-text-secondary">
          Executive approval is still pending. ORGOS will keep your onboarding context ready so you can continue immediately once access is granted.
        </div>
        <div className="flex justify-center">
          <Button asChild variant="outline">
            <Link href="/login">Check again from login</Link>
          </Button>
        </div>
      </div>
    </AuthPageShell>
  );
}
