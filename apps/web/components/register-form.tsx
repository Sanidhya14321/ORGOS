"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
        <Label>Executive role</Label>
        <select
          className="flex h-12 w-full rounded-2xl border border-border bg-bg-subtle/75 px-4 py-3 text-sm text-text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/25"
          value={role}
          onChange={(event) => setRole(event.target.value as "ceo" | "cfo")}
        >
          <option value="ceo">Owner / CEO</option>
          <option value="cfo">CFO / Finance lead</option>
        </select>
      </label>

      <label className="block space-y-2">
        <Label>Full name</Label>
        <Input
          type="text"
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          placeholder="Jordan Rivera"
          autoComplete="name"
          required
        />
      </label>

      <label className="block space-y-2">
        <Label>Email</Label>
        <Input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="name@orgos.ai"
          autoComplete="email"
          required
        />
      </label>

      <label className="block space-y-2">
        <Label>Password</Label>
        <Input
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
        <Label>Department</Label>
        <Input
          type="text"
          value={department}
          onChange={(event) => setDepartment(event.target.value)}
          placeholder="Operations, Product, Finance"
          autoComplete="organization"
        />
      </label>

      {error ? <p className="rounded-2xl border border-danger/20 bg-danger-subtle px-4 py-3 text-sm text-danger">{error}</p> : null}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Creating account..." : "Create account"}
      </Button>

      <p className="text-center text-sm text-[var(--muted)]">
        Already provisioned? <Link href="/login" className="font-semibold text-[var(--accent)] underline-offset-4 hover:underline">Sign in</Link>
      </p>
    </form>
  );
}