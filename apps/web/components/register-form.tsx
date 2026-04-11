"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";
import { setAuthCookies } from "@/lib/auth";

export function RegisterForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
        body: JSON.stringify({ fullName, email, password, department }),
        credentials: "include"
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
        throw new Error(body?.error?.message ?? "Registration failed");
      }

      const data = await response.json() as { accessToken: string; user: { role: string } };
      setAuthCookies(data.accessToken, data.user.role);
      router.push(`/dashboard/${data.user.role}`);
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
        <span className="text-sm font-semibold uppercase tracking-[0.22em] text-[#6b7280]">Full name</span>
        <input
          className="w-full rounded-2xl border border-[#ddd6c8] bg-white px-4 py-3 text-[#121826] outline-none transition focus:border-[#ff6b35]"
          type="text"
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          placeholder="Jordan Rivera"
          autoComplete="name"
          required
        />
      </label>

      <label className="block space-y-2">
        <span className="text-sm font-semibold uppercase tracking-[0.22em] text-[#6b7280]">Email</span>
        <input
          className="w-full rounded-2xl border border-[#ddd6c8] bg-white px-4 py-3 text-[#121826] outline-none transition focus:border-[#ff6b35]"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="name@orgos.ai"
          autoComplete="email"
          required
        />
      </label>

      <label className="block space-y-2">
        <span className="text-sm font-semibold uppercase tracking-[0.22em] text-[#6b7280]">Password</span>
        <input
          className="w-full rounded-2xl border border-[#ddd6c8] bg-white px-4 py-3 text-[#121826] outline-none transition focus:border-[#ff6b35]"
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
        <span className="text-sm font-semibold uppercase tracking-[0.22em] text-[#6b7280]">Department</span>
        <input
          className="w-full rounded-2xl border border-[#ddd6c8] bg-white px-4 py-3 text-[#121826] outline-none transition focus:border-[#ff6b35]"
          type="text"
          value={department}
          onChange={(event) => setDepartment(event.target.value)}
          placeholder="Operations, Product, Finance"
          autoComplete="organization"
        />
      </label>

      {error ? <p className="rounded-2xl bg-[#fff0e6] px-4 py-3 text-sm text-[#9f4f20]">{error}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex w-full items-center justify-center rounded-2xl bg-[#ff6b35] px-4 py-3 font-semibold text-white transition hover:bg-[#ea5826] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Creating account..." : "Create account"}
      </button>

      <p className="text-center text-sm text-[#5f6470]">
        Already have access? <Link href="/login" className="font-semibold text-[#121826] underline-offset-4 hover:underline">Sign in</Link>
      </p>
    </form>
  );
}