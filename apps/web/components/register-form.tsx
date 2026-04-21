"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";

export function RegisterForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"ceo" | "cfo">("ceo");
  const [department, setDepartment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000"}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, email, password, role, department }),
        credentials: "include"
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
        throw new Error(body?.error?.message ?? "Registration failed");
      }

      router.push(`/verify?email=${encodeURIComponent(email)}`);
      router.refresh();
    } catch (registerError) {
      setError(registerError instanceof Error ? registerError.message : "Unable to create account");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block space-y-2">
        <span className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">Executive role</span>
        <select
          className="w-full rounded-2xl border border-[#2c3240] bg-[#0f1115] px-4 py-3 text-[#eef2ff] outline-none transition focus:border-[#f59e0b]"
          value={role}
          onChange={(event) => setRole(event.target.value as "ceo" | "cfo")}
        >
          <option value="ceo">Owner / CEO</option>
          <option value="cfo">CFO / Finance lead</option>
        </select>
      </label>

      <label className="block space-y-2">
        <span className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">Full name</span>
        <input
          className="w-full rounded-2xl border border-[#2c3240] bg-[#0f1115] px-4 py-3 text-[#eef2ff] outline-none transition focus:border-[#f59e0b]"
          type="text"
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          placeholder="Jordan Rivera"
          autoComplete="name"
          required
        />
      </label>

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
          placeholder="Create a password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </label>

      <label className="block space-y-2">
        <span className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">Department</span>
        <input
          className="w-full rounded-2xl border border-[#2c3240] bg-[#0f1115] px-4 py-3 text-[#eef2ff] outline-none transition focus:border-[#f59e0b]"
          type="text"
          value={department}
          onChange={(event) => setDepartment(event.target.value)}
          placeholder="Operations, Product, Finance"
          autoComplete="organization"
        />
      </label>

      {error ? <p className="rounded-2xl border border-[#3a2f1f] bg-[#25170f] px-4 py-3 text-sm text-[#fdba74]">{error}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex w-full items-center justify-center rounded-2xl bg-[#f59e0b] px-4 py-3 font-semibold text-[#0f1115] transition hover:bg-[#d97706] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Creating account..." : "Create account"}
      </button>

      <p className="text-center text-sm text-[var(--muted)]">
        Already provisioned? <Link href="/login" className="font-semibold text-[#eef2ff] underline-offset-4 hover:underline">Sign in</Link>
      </p>
    </form>
  );
}