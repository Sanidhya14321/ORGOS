"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { setRoleCookie } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialEmail = useMemo(() => searchParams.get("email") ?? "", [searchParams]);
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) {
      return;
    }

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

      const data = await response.json() as {
        user: { role: string; status?: string };
        mfaRequired?: boolean;
        mfaSetupRequired?: boolean;
      };
      setRoleCookie(data.user.role);
      const localDevelopment = typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
      if (!localDevelopment && (data.mfaRequired || data.mfaSetupRequired) && (data.user.role === "ceo" || data.user.role === "cfo")) {
        router.push("/setup-mfa");
      } else if (data.user.status === "pending") {
        router.push("/pending");
      } else {
        router.push(`/dashboard/${data.user.role}`);
      }
      router.refresh();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Unable to sign in");
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block space-y-2">
        <Label htmlFor="email" className="text-sm font-medium text-text-secondary">Email</Label>
        <Input
          id="email"
          className="border-border bg-bg-subtle text-text-primary"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="name@orgos.ai"
          autoComplete="email"
          required
        />
      </label>

      <label className="block space-y-2">
        <Label htmlFor="password" className="text-sm font-medium text-text-secondary">Password</Label>
        <div className="relative">
          <Input
            id="password"
            className="border-border bg-bg-subtle pr-10 text-text-primary"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Your password"
            autoComplete="current-password"
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            className="focus-ring absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-text-secondary"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </label>

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <Button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="w-full bg-accent text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-[var(--accent)]/70 disabled:text-white/80"
      >
        {pending ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Signing in...
          </span>
        ) : (
          "Sign in"
        )}
      </Button>
    </form>
  );
}