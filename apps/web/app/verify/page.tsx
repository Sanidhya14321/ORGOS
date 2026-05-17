"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AuthPageShell } from "@/components/auth/auth-page-shell";

export default function VerifyPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/login");
  }, [router]);

  return (
    <AuthPageShell
      eyebrow="ORGOS access"
      title="Sign in to continue"
      description="Email verification is no longer required. Use your email and password to sign in."
    >
      <p className="text-sm text-text-secondary">Redirecting to sign in…</p>
    </AuthPageShell>
  );
}
