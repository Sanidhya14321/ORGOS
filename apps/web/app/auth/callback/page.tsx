"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { LoadingScreen } from "@/components/loading-screen";
import { AuthPageShell } from "@/components/auth/auth-page-shell";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { completeOAuthSession, resolvePostLoginPath } from "@/lib/auth-session";

function AuthCallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function finishOAuth() {
      const code = searchParams?.get("code");
      const oauthError = searchParams?.get("error_description") ?? searchParams?.get("error");

      if (oauthError) {
        if (!cancelled) {
          setError(oauthError);
        }
        return;
      }

      if (!code) {
        if (!cancelled) {
          setError("Missing OAuth authorization code. Try signing in again.");
        }
        return;
      }

      try {
        const supabase = createBrowserSupabase();
        const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

        if (exchangeError || !data.session?.access_token) {
          throw new Error(exchangeError?.message ?? "Unable to complete Google sign-in");
        }

        const session = await completeOAuthSession(data.session.access_token);
        if (cancelled) {
          return;
        }

        router.push(resolvePostLoginPath(session));
        router.refresh();
      } catch (callbackError) {
        if (!cancelled) {
          setError(callbackError instanceof Error ? callbackError.message : "Unable to complete Google sign-in");
        }
      }
    }

    void finishOAuth();

    return () => {
      cancelled = true;
    };
  }, [router, searchParams]);

  if (error) {
    return (
      <div className="space-y-4 text-center">
        <div className="rounded-2xl border border-danger/20 bg-danger-subtle px-4 py-3 text-sm text-danger">{error}</div>
        <Link href="/login" className="font-semibold text-[var(--accent)] transition hover:text-[var(--accent-hover)]">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
      <p className="text-sm text-text-secondary">Completing Google sign-in...</p>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <AuthPageShell
      eyebrow="ORGOS access"
      title="Signing you in"
      description="Finishing Google authentication and preparing your workspace."
    >
      <Suspense fallback={<LoadingScreen compact />}>
        <AuthCallbackHandler />
      </Suspense>
    </AuthPageShell>
  );
}
