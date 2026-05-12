'use client';

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import { Download, KeyRound, Link2, Mail, RefreshCw, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";

type TeamMember = {
  id: string;
  email?: string;
  full_name: string;
  role: string;
  status?: string;
  department?: string;
  position_title?: string | null;
};

type SeatRecord = {
  position_id: string;
  position_title: string;
  level: number;
  department?: string | null;
  branch_name?: string | null;
  power_level: number;
  visibility_scope: string;
  seat_label?: string | null;
  assignment_status: string;
  activation_state: string;
  occupant_name?: string | null;
  occupant_email?: string | null;
  invite_email?: string | null;
  email?: string | null;
  invite_code?: string | null;
  invitation_url?: string | null;
  activation_status?: string | null;
  issued_mode?: string | null;
  force_password_change: boolean;
  invite_expires_at?: string | null;
};

type ResetAccessResponse = {
  plaintext_password: string;
  email: string;
  invite_code?: string;
  invitation_url?: string;
};

export default function TeamPage() {
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, string>>({});
  const queryClient = useQueryClient();

  const meQuery = useQuery({
    queryKey: ["team-me"],
    queryFn: () => apiFetch<{ org_id?: string | null; role: string }>("/api/me")
  });

  const currentRole = meQuery.data?.role?.toLowerCase() ?? null;
  const isExecutive = currentRole === "ceo" || currentRole === "cfo";

  const teamDirectoryQuery = useQuery({
    queryKey: ["team-directory", meQuery.data?.org_id],
    queryFn: () => apiFetch<{ items: SeatRecord[] }>(`/api/onboarding/org/${meQuery.data?.org_id}/team-directory`),
    select: (data) => data.items ?? [],
    enabled: Boolean(meQuery.data?.org_id) && currentRole === "ceo"
  });

  const accountsQuery = useQuery({
    queryKey: ["team-members", meQuery.data?.org_id],
    queryFn: () => apiFetch<{ items: TeamMember[] }>(`/api/orgs/${meQuery.data?.org_id}/accounts?limit=100`),
    select: (data) => data.items ?? [],
    enabled: Boolean(meQuery.data?.org_id) && !isExecutive
  });

  const resetAccessMutation = useMutation({
    mutationFn: (positionId: string) =>
      apiFetch<ResetAccessResponse>(`/api/onboarding/org/${meQuery.data?.org_id}/positions/${positionId}/reset-password`, {
        method: "POST",
        body: JSON.stringify({})
      }),
    onSuccess: (data, positionId) => {
      setRevealedPasswords((previous) => ({
        ...previous,
        [positionId]: data.plaintext_password
      }));
      toast.success("Access reset. Share the invite link or temporary password securely.");
      void queryClient.invalidateQueries({ queryKey: ["team-directory"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to reset position access");
    }
  });

  function copyToClipboard(value: string, label: string) {
    void navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  }

  if (currentRole === "ceo") {
    const seats = teamDirectoryQuery.data ?? [];
    const activatedCount = seats.filter((seat) => seat.activation_state === "activated").length;
    const pendingCount = seats.filter((seat) => seat.activation_state !== "activated").length;

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-text-primary">Team Directory</h1>
            <p className="mt-1 text-sm text-text-secondary">
              Provision position access, monitor activation state, and manage invite handoff for each seat.
            </p>
          </div>
          <Button
            className="bg-accent hover:bg-accent-hover"
            onClick={() => {
              const orgId = meQuery.data?.org_id;
              if (orgId) {
                window.location.href = `/api/onboarding/org/${orgId}/export-credentials`;
              }
            }}
          >
            <Download className="mr-2 h-4 w-4" />
            Export Access Sheet
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border border-border bg-bg-surface p-4">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-secondary">Provisioned seats</p>
            <p className="mt-2 text-3xl font-bold text-text-primary">{seats.length}</p>
          </Card>
          <Card className="border border-border bg-bg-surface p-4">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-secondary">Activated</p>
            <p className="mt-2 text-3xl font-bold text-text-primary">{activatedCount}</p>
          </Card>
          <Card className="border border-border bg-bg-surface p-4">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-secondary">Pending access</p>
            <p className="mt-2 text-3xl font-bold text-text-primary">{pendingCount}</p>
          </Card>
        </div>

        {teamDirectoryQuery.isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((item) => (
              <Card key={item} className="border border-border bg-bg-surface p-4">
                <Skeleton className="h-28 w-full" />
              </Card>
            ))}
          </div>
        ) : seats.length === 0 ? (
          <Card className="border border-border bg-bg-surface p-8 text-center">
            <Users className="mx-auto mb-3 h-8 w-8 text-text-secondary" />
            <p className="text-text-secondary">No positions have been provisioned yet.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {seats.map((seat) => (
              <Card key={seat.position_id} className="border border-border bg-bg-surface p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold text-text-primary">{seat.position_title}</h3>
                      <Badge className="bg-blue-50 text-blue-700 border border-blue-200">Level {seat.level}</Badge>
                      <Badge className="bg-violet-50 text-violet-700 border border-violet-200">Power {seat.power_level}</Badge>
                      <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {seat.activation_state === "activated" ? "Activated" : "Pending activation"}
                      </Badge>
                    </div>

                    <div className="grid gap-2 text-sm text-text-secondary sm:grid-cols-2">
                      <p>Department: {seat.department ?? "Unassigned"}</p>
                      <p>Branch: {seat.branch_name ?? "Main org"}</p>
                      <p>Visibility: {seat.visibility_scope}</p>
                      <p>Seat: {seat.seat_label ?? "Default seat"}</p>
                      <p>Login: {seat.email ?? "Not issued"}</p>
                      <p>Invite email: {seat.invite_email ?? seat.occupant_email ?? "Not shared yet"}</p>
                    </div>

                    <div className="rounded-xl border border-border bg-bg-subtle p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-secondary">Occupant</p>
                      <p className="mt-1 text-sm text-text-primary">
                        {seat.occupant_name ?? "Vacant seat"}
                        {seat.occupant_email ? ` · ${seat.occupant_email}` : ""}
                      </p>
                    </div>

                    <div className="grid gap-3 lg:grid-cols-3">
                      <div className="rounded-xl border border-border bg-bg-subtle p-3">
                        <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
                          <Mail className="h-4 w-4" />
                          Login email
                        </div>
                        <p className="mt-2 font-mono text-xs text-text-secondary">{seat.email ?? "Not generated"}</p>
                        {seat.email ? (
                          <Button size="sm" variant="ghost" className="mt-2 px-0" onClick={() => copyToClipboard(seat.email!, "Login email")}>
                            Copy
                          </Button>
                        ) : null}
                      </div>

                      <div className="rounded-xl border border-border bg-bg-subtle p-3">
                        <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
                          <Link2 className="h-4 w-4" />
                          Invite
                        </div>
                        <p className="mt-2 font-mono text-xs text-text-secondary">{seat.invite_code ?? "Not issued"}</p>
                        {seat.invitation_url ? (
                          <Button size="sm" variant="ghost" className="mt-2 px-0" onClick={() => copyToClipboard(seat.invitation_url!, "Invite link")}>
                            Copy link
                          </Button>
                        ) : null}
                      </div>

                      <div className="rounded-xl border border-border bg-bg-subtle p-3">
                        <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
                          <KeyRound className="h-4 w-4" />
                          Temporary password
                        </div>
                        <p className="mt-2 font-mono text-xs text-text-secondary">
                          {revealedPasswords[seat.position_id] ?? "Hidden until you reset access"}
                        </p>
                        <p className="mt-1 text-[11px] text-text-secondary">
                          {seat.force_password_change ? "Employee must change this on first login." : "Password already rotated."}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Button
                      variant="outline"
                      className="border-border"
                      onClick={() => resetAccessMutation.mutate(seat.position_id)}
                      disabled={resetAccessMutation.isPending}
                    >
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Reissue access
                    </Button>
                    {seat.invitation_url ? (
                      <Button variant="ghost" onClick={() => copyToClipboard(seat.invitation_url!, "Invite link")}>
                        <ShieldCheck className="mr-2 h-4 w-4" />
                        Copy invite link
                      </Button>
                    ) : null}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  const team = accountsQuery.data ?? [];
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-text-primary">Team Directory</h1>
        <p className="mt-1 text-sm text-text-secondary">View the active people currently assigned within your organization.</p>
      </div>

      {accountsQuery.isLoading ? (
        <Card className="border border-border bg-bg-surface p-4">
          <Skeleton className="h-40 w-full" />
        </Card>
      ) : team.length === 0 ? (
        <Card className="border border-border bg-bg-surface p-8 text-center">
          <Users className="mx-auto mb-3 h-8 w-8 text-text-secondary" />
          <p className="text-text-secondary">No active team records are available.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {team.map((member) => (
            <Card key={member.id} className="border border-border bg-bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-text-primary">{member.full_name}</h3>
                    <Badge className="bg-slate-50 text-slate-700 border border-slate-200">{member.role}</Badge>
                    <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200">{member.status ?? "active"}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-text-secondary">
                    {member.position_title ?? "Unassigned position"}
                    {member.department ? ` · ${member.department}` : ""}
                    {member.email ? ` · ${member.email}` : ""}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
