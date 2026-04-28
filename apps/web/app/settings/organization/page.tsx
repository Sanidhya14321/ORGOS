"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Role } from "@/lib/models";

type MeResponse = { role: Role; org_id?: string | null };
type BillingResponse = { plan: string; seat_limit: number; usage: Record<string, unknown>; renewal_date?: string | null };

export default function OrganizationPage() {
  const queryClient = useQueryClient();
  const meQuery = useQuery({ queryKey: ["org-settings-me"], queryFn: () => apiFetch<MeResponse>("/api/me") });
  const billingQuery = useQuery({
    queryKey: ["org-billing", meQuery.data?.org_id],
    queryFn: () => apiFetch<BillingResponse>(`/api/orgs/${meQuery.data?.org_id}/billing`),
    enabled: Boolean(meQuery.data?.org_id)
  });

  const snapshotMutation = useMutation({
    mutationFn: () => apiFetch(`/api/orgs/${meQuery.data?.org_id}/analytics/snapshot`, { method: "POST" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["org-billing"] });
    }
  });

  return (
    <AppShell eyebrow="Organization" title="Multi-tenant controls" description="Billing, branding, and operational controls for the current org." role={meQuery.data?.role}>
      <div className="space-y-4">
        <Card className="space-y-3 border border-border bg-bg-surface p-4">
          <h2 className="text-lg font-semibold">Billing</h2>
          <p className="text-sm text-text-secondary">Plan: {billingQuery.data?.plan ?? "starter"}</p>
          <p className="text-sm text-text-secondary">Seat limit: {billingQuery.data?.seat_limit ?? 25}</p>
          <Button onClick={() => snapshotMutation.mutate()} disabled={snapshotMutation.isPending}>Refresh usage snapshot</Button>
        </Card>
        <Card className="space-y-3 border border-border bg-bg-surface p-4">
          <h2 className="text-lg font-semibold">Branding</h2>
          <Input placeholder="Custom domain" className="border-border bg-bg-subtle" />
          <Input placeholder="Primary color" className="border-border bg-bg-subtle" />
          <Textarea placeholder="Logo URL or white-label notes" className="border-border bg-bg-subtle" />
        </Card>
      </div>
    </AppShell>
  );
}