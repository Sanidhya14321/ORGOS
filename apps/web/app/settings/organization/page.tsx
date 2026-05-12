"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { canAccessSection } from "@/lib/access";
import type { Role } from "@/lib/models";

type MeResponse = { role: Role; org_id?: string | null };
type BillingResponse = { plan: string; seat_limit: number; usage: Record<string, unknown>; renewal_date?: string | null };

export default function OrganizationPage() {
  const queryClient = useQueryClient();
  const meQuery = useQuery({ queryKey: ["org-settings-me"], queryFn: () => apiFetch<MeResponse>("/api/me") });
  const canManageOrganization = canAccessSection(meQuery.data?.role, "orgSettings");
  const billingQuery = useQuery({
    queryKey: ["org-billing", meQuery.data?.org_id],
    queryFn: () => apiFetch<BillingResponse>(`/api/orgs/${meQuery.data?.org_id}/billing`),
    enabled: Boolean(meQuery.data?.org_id) && canManageOrganization
  });

  const snapshotMutation = useMutation({
    mutationFn: () => apiFetch(`/api/orgs/${meQuery.data?.org_id}/analytics/snapshot`, { method: "POST" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["org-billing"] });
    }
  });

  return (
    <AppShell eyebrow="Organization" title="Multi-tenant controls" description="Billing, branding, and operational controls for the current org." role={meQuery.data?.role}>
      <div className="grid gap-4 xl:grid-cols-[0.88fr_1.12fr]">
        {!canManageOrganization ? (
          <Card className="space-y-2 p-5 xl:col-span-2">
            <h2 className="text-lg font-semibold">Restricted section</h2>
            <p className="text-sm text-text-secondary">Organization billing and tenant controls are available to CEO and CFO roles only.</p>
          </Card>
        ) : null}

        <Card className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <p className="dashboard-label">Billing</p>
              <h2 className="text-lg font-semibold">Plan and seat envelope</h2>
            </div>
            <Badge variant="secondary">{billingQuery.data?.plan ?? "starter"}</Badge>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[24px] border border-border bg-bg-elevated p-4">
              <p className="dashboard-label">Seat limit</p>
              <p className="mt-2 text-2xl font-semibold text-text-primary">{billingQuery.data?.seat_limit ?? 25}</p>
            </div>
            <div className="rounded-[24px] border border-border bg-bg-elevated p-4">
              <p className="dashboard-label">Renewal cadence</p>
              <p className="mt-2 text-sm font-medium text-text-primary">{billingQuery.data?.renewal_date ?? "Managed internally"}</p>
            </div>
          </div>
          <Button onClick={() => snapshotMutation.mutate()} disabled={!canManageOrganization || snapshotMutation.isPending}>
            {snapshotMutation.isPending ? "Refreshing..." : "Refresh usage snapshot"}
          </Button>
        </Card>

        <Card className="space-y-4 p-5">
          <div className="space-y-1">
            <p className="dashboard-label">Branding</p>
            <h2 className="text-lg font-semibold">Workspace identity</h2>
            <p className="text-sm leading-6 text-text-secondary">
              Configure the organization-facing defaults that shape the experience for every team member.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="dashboard-label">Custom domain</label>
              <Input placeholder="ops.yourcompany.com" />
            </div>
            <div className="space-y-2">
              <label className="dashboard-label">Primary color</label>
              <Input placeholder="#4F6658" />
            </div>
          </div>
          <div className="space-y-2">
            <label className="dashboard-label">Notes</label>
            <Textarea placeholder="Logo URL, white-label guidance, or custom launch notes" className="min-h-[132px] border-border bg-bg-subtle" />
          </div>
        </Card>
      </div>
    </AppShell>
  );
}