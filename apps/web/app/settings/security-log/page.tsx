"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import type { AuditLogEntry, Role } from "@/lib/models";

type MeResponse = { role: Role; org_id?: string | null };

export default function SecurityLogPage() {
  const meQuery = useQuery({ queryKey: ["security-log-me"], queryFn: () => apiFetch<MeResponse>("/api/me") });
  const logQuery = useQuery({
    queryKey: ["security-log"],
    queryFn: () => apiFetch<{ items: AuditLogEntry[] }>("/api/security-log"),
    enabled: meQuery.data?.role === "ceo" || meQuery.data?.role === "cfo"
  });

  return (
    <AppShell eyebrow="Security" title="Security audit log" description="Recent security-related events across auth, sessions, and integrations." role={meQuery.data?.role}>
      <Card className="space-y-3 border border-border bg-bg-surface p-4">
        {(logQuery.data?.items ?? []).length === 0 ? <p className="text-sm text-text-secondary">No security events yet.</p> : (logQuery.data?.items ?? []).map((entry) => (
          <div key={entry.id} className="rounded-lg border border-border bg-bg-elevated p-3 text-sm">
            <p className="font-medium">{entry.action}</p>
            <p className="text-text-secondary">{entry.entity} · {entry.severity} · {entry.created_at}</p>
          </div>
        ))}
      </Card>
    </AppShell>
  );
}