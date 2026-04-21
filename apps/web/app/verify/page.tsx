"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { FormEvent } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

function VerifyPageContent() {
  const params = useSearchParams();
  const router = useRouter();
  const initialEmail = useMemo(() => params.get("email") ?? "", [params]);

  const [email, setEmail] = useState(initialEmail);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`${API_BASE}/api/auth/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(body?.error?.message ?? "Verification failed");
      }

      setMessage("Verification recorded. Sign in to continue profile setup.");
      router.push(`/login?verified=1&email=${encodeURIComponent(email)}`);
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : "Unable to verify account");
    } finally {
      setPending(false);
    }
  }

  return (
    <AppShell
      eyebrow="ORGOS onboarding"
      title="Verify your account"
      description="Confirm your email to continue onboarding and request organization approval."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <label className="block space-y-2">
          <span className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">Email</span>
          <input
            className="w-full rounded-2xl border border-[#2c3240] bg-[#0f1115] px-4 py-3 text-[#eef2ff] outline-none transition focus:border-[#f59e0b]"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@orgos.ai"
            required
          />
        </label>

        {error ? <p className="rounded-2xl border border-[#3a2f1f] bg-[#25170f] px-4 py-3 text-sm text-[#fdba74]">{error}</p> : null}
        {message ? <p className="rounded-2xl border border-[#1b3d2a] bg-[#102017] px-4 py-3 text-sm text-[#86efac]">{message}</p> : null}

        <button
          type="submit"
          disabled={pending}
          className="inline-flex w-full items-center justify-center rounded-2xl bg-[#f59e0b] px-4 py-3 font-semibold text-[#0f1115] transition hover:bg-[#d97706] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Verifying..." : "Verify email"}
        </button>

        <p className="text-center text-sm text-[#5f6470]">
          Already verified?{" "}
          <Link href="/login" className="font-semibold text-[#eef2ff] underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </AppShell>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<p className="px-6 py-8 text-sm text-[#6b7280]">Loading verification details...</p>}>
      <VerifyPageContent />
    </Suspense>
  );
}
