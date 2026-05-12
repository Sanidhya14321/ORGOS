"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

function VerifyPageContent() {
  const params = useSearchParams();
  const router = useRouter();
  const initialEmail = useMemo(() => params?.get("email") ?? "", [params]);
  const tokenHash = useMemo(() => params?.get("token_hash") ?? "", [params]);
  const verificationType = useMemo(() => params?.get("type") ?? "", [params]);

  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tokenHash || !verificationType) {
      setError("This verification link is incomplete. Open the latest email from ORGOS and use the full link.");
      return;
    }

    let mounted = true;

    void (async () => {
      setPending(true);
      setError(null);
      setMessage(null);

      try {
        const response = await fetch(`${API_BASE}/api/auth/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tokenHash, type: verificationType })
        });

        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
          throw new Error(body?.error?.message ?? "Verification failed");
        }

        if (!mounted) {
          return;
        }

        setMessage("Email verified. Sign in to continue onboarding.");
        const targetEmail = initialEmail ? `&email=${encodeURIComponent(initialEmail)}` : "";
        window.setTimeout(() => {
          router.push(`/login?verified=1${targetEmail}`);
        }, 1200);
      } catch (verifyError) {
        if (!mounted) {
          return;
        }
        setError(verifyError instanceof Error ? verifyError.message : "Unable to verify account");
      } finally {
        if (mounted) {
          setPending(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [initialEmail, router, tokenHash, verificationType]);

  return (
    <AppShell
      eyebrow="ORGOS onboarding"
      title="Verify your account"
      description="Confirm your email to continue onboarding and request organization approval."
    >
      <div className="space-y-4">
        <div className="rounded-2xl border border-[#2c3240] bg-[#0f1115] px-4 py-3 text-sm text-[#cfd6e6]">
          {pending ? "Validating your secure verification link..." : "Verification links can only be completed from the email that ORGOS sent you."}
        </div>

        {error ? <p className="rounded-2xl border border-[#3a2f1f] bg-[#25170f] px-4 py-3 text-sm text-[#fdba74]">{error}</p> : null}
        {message ? <p className="rounded-2xl border border-[#1b3d2a] bg-[#102017] px-4 py-3 text-sm text-[#86efac]">{message}</p> : null}

        <p className="text-center text-sm text-[#5f6470]">
          Need another try?{" "}
          <Link href="/login" className="font-semibold text-[#eef2ff] underline-offset-4 hover:underline">
            Return to sign in
          </Link>
        </p>
      </div>
    </AppShell>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<p className="px-6 py-8 text-sm text-[var(--muted)]">Loading verification details...</p>}>
      <VerifyPageContent />
    </Suspense>
  );
}
