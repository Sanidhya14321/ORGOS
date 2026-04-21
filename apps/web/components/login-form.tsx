"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { setRoleCookie } from "@/lib/auth";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialEmail = useMemo(() => searchParams.get("email") ?? "", [searchParams]);
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000"}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include"
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
        throw new Error(body?.error?.message ?? "Login failed");
      }

      const data = await response.json() as { user: { role: string; status?: string } };
      setRoleCookie(data.user.role);
      if (data.user.status === "pending") {
        router.push("/pending");
      } else {
        router.push(`/dashboard/${data.user.role}`);
      }
      router.refresh();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Unable to sign in");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block space-y-2">
        <span className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">Email</span>
        <input
          className="w-full rounded-2xl border border-[#2c3240] bg-[#0f1115] px-4 py-3 text-[#eef2ff] outline-none transition focus:border-[#f59e0b]"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="name@orgos.ai"
          autoComplete="email"
          required
        />
      </label>

      <label className="block space-y-2">
        <span className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">Password</span>
        <input
          className="w-full rounded-2xl border border-[#2c3240] bg-[#0f1115] px-4 py-3 text-[#eef2ff] outline-none transition focus:border-[#f59e0b]"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Your password"
          autoComplete="current-password"
          required
        />
      </label>

      {error ? <p className="rounded-2xl border border-[#3a2f1f] bg-[#25170f] px-4 py-3 text-sm text-[#fdba74]">{error}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex w-full items-center justify-center rounded-2xl bg-[#f59e0b] px-4 py-3 font-semibold text-[#0f1115] transition hover:bg-[#d97706] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Signing in..." : "Sign in"}
      </button>

      <p className="text-center text-sm text-[var(--muted)]">
        New here? <Link href="/register" className="font-semibold text-[#eef2ff] underline-offset-4 hover:underline">Create an account</Link>
      </p>
    </form>
  );
}