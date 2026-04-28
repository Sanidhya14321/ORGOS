"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type SessionItem = {
  id: string;
  device?: string | null;
  browser?: string | null;
  ip?: string | null;
  country?: string | null;
  revoked: boolean;
  last_active?: string | null;
  created_at?: string | null;
  current: boolean;
};

type SessionsResponse = {
  items: SessionItem[];
};

export default function SecuritySettingsPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    void (async () => {
      try {
        const response = await apiFetch<SessionsResponse>("/api/auth/sessions");
        if (!mounted) {
          return;
        }
        setSessions(response.items);
      } catch (requestError) {
        if (!mounted) {
          return;
        }
        setError(requestError instanceof Error ? requestError.message : "Unable to load sessions");
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  async function revokeSession(sessionId: string) {
    setPendingSessionId(sessionId);
    setError(null);

    try {
      await apiFetch(`/api/auth/sessions/${sessionId}/revoke`, {
        method: "POST"
      });
      setSessions((current) => current.filter((session) => session.id !== sessionId));
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to revoke session");
    } finally {
      setPendingSessionId(null);
    }
  }

  return (
    <AppShell eyebrow="Security" title="Active sessions" description="Review devices currently signed in to ORGOS.">
      {loading ? <p className="text-sm text-[var(--muted)]">Loading sessions...</p> : null}
      {error ? <p className="rounded-2xl border border-[#3a2f1f] bg-[#25170f] px-4 py-3 text-sm text-[#fdba74]">{error}</p> : null}

      {!loading ? (
        <div className="space-y-3">
          {sessions.length === 0 ? <p className="text-sm text-[var(--muted)]">No active sessions found.</p> : null}

          {sessions.map((session) => (
            <Card key={session.id} className="border border-[var(--border)] bg-[#0f1115] p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1 text-sm text-[var(--muted)]">
                  <p className="text-[var(--ink)]">
                    {session.device ?? "Unknown device"} {session.current ? "(current)" : ""}
                  </p>
                  <p>{session.browser ?? "Unknown browser"}</p>
                  <p>
                    {session.country ?? "Unknown country"} · {session.ip ?? "Unknown IP"}
                  </p>
                  <p>Last active: {session.last_active ?? session.created_at ?? "Unknown"}</p>
                </div>

                <Button
                  variant="outline"
                  className="border-[var(--border)] hover:bg-[#151922]"
                  onClick={() => revokeSession(session.id)}
                  disabled={pendingSessionId === session.id || session.revoked}
                >
                  {pendingSessionId === session.id ? "Revoking..." : session.revoked ? "Revoked" : "Revoke"}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      ) : null}
    </AppShell>
  );
}