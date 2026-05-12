"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import Link from "next/link";
import { AuthPageShell } from "@/components/auth/auth-page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api";
import type { Role } from "@/lib/models";

type MfaStatus = {
  required: boolean;
  enabled: boolean;
  role?: Role;
  email?: string;
  fullName?: string;
  secret?: string;
  otpauthUri?: string;
  qrCodeDataUrl?: string;
};

export default function SetupMfaPage() {
  const router = useRouter();
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    void (async () => {
      try {
        const nextStatus = await apiFetch<MfaStatus>("/api/auth/mfa-status");
        if (!mounted) {
          return;
        }
        setStatus(nextStatus);

        if (!nextStatus.required) {
          router.push(`/dashboard/${nextStatus.role ?? "ceo"}`);
          router.refresh();
          return;
        }
      } catch (requestError) {
        if (!mounted) {
          return;
        }
        setError(requestError instanceof Error ? requestError.message : "Unable to load MFA status");
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [router]);

  const title = useMemo(() => {
    if (!status) {
      return "Set up MFA";
    }
    return status.enabled ? "Verify MFA" : "Set up MFA";
  }, [status]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!status) {
      return;
    }

    setPending(true);
    setError(null);
    setMessage(null);

    try {
      if (status.enabled) {
        const response = await apiFetch<{ verified: boolean; role?: Role }>("/api/auth/mfa-verify", {
          method: "POST",
          body: JSON.stringify({ code })
        });

        if (response.verified) {
          router.push(`/dashboard/${response.role ?? status.role ?? "ceo"}`);
          router.refresh();
        }
        return;
      }

      if (!status.secret) {
        throw new Error("Missing MFA secret");
      }

      const response = await apiFetch<{ enrolled: boolean }>("/api/auth/mfa-enroll", {
        method: "POST",
        body: JSON.stringify({ secret: status.secret, code })
      });

      if (response.enrolled) {
        setMessage("MFA enrolled. Verification complete.");
        router.push(`/dashboard/${status.role ?? "ceo"}`);
        router.refresh();
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to complete MFA setup");
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthPageShell
      eyebrow="ORGOS security"
      title={title}
      description="Complete MFA before entering the dashboard."
      footer={
        <div className="text-center">
          Need help?{" "}
          <Link href="/login" className="font-semibold text-[var(--accent)] underline-offset-4 hover:underline">
            Return to login
          </Link>
        </div>
      }
    >
      {loading ? <p className="text-sm text-[var(--muted)]">Loading MFA setup...</p> : null}

      {!loading && status ? (
        <form onSubmit={onSubmit} className="space-y-5">
          {!status.enabled ? (
            <div className="space-y-4 rounded-3xl border border-[var(--border)] bg-bg-elevated p-4">
              <div className="space-y-2">
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">Scan QR code</p>
                <p className="text-sm text-[var(--muted)]">Use Google Authenticator, Authy, or 1Password to scan this code.</p>
              </div>

              {status.qrCodeDataUrl ? (
                <img
                  src={status.qrCodeDataUrl}
                  alt="MFA QR code"
                  className="h-56 w-56 rounded-2xl border border-[var(--border)] bg-white p-3"
                />
              ) : null}

              {status.secret ? (
                <div className="rounded-2xl border border-[var(--border)] bg-bg-surface px-4 py-3 text-sm text-[var(--muted)]">
                  Manual secret: <span className="font-mono text-[var(--ink)]">{status.secret}</span>
                </div>
              ) : null}

              {status.otpauthUri ? (
                <p className="break-all text-xs text-[var(--muted)]">{status.otpauthUri}</p>
              ) : null}
            </div>
          ) : (
            <div className="rounded-3xl border border-[var(--border)] bg-bg-elevated p-4 text-sm text-[var(--muted)]">
              Enter the current 6-digit code from your authenticator app to continue.
            </div>
          )}

          <label className="block space-y-2">
            <Label>Verification code</Label>
            <Input
              type="text"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="123456"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
            />
          </label>

          {error ? <p className="rounded-2xl border border-danger/20 bg-danger-subtle px-4 py-3 text-sm text-danger">{error}</p> : null}
          {message ? <p className="rounded-2xl border border-success/20 bg-success-subtle px-4 py-3 text-sm text-success">{message}</p> : null}

          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Processing..." : status.enabled ? "Verify code" : "Enroll MFA"}
          </Button>
        </form>
      ) : null}
    </AuthPageShell>
  );
}