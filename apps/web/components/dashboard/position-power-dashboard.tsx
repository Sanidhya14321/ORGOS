"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { canAccessSection } from "@/lib/access";
import type { PositionPowerControlsResponse, PositionPowerItem, Role } from "@/lib/models";
import { DashboardMetric, DashboardPageFrame, DashboardSection } from "@/components/dashboard/dashboard-surface";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

type MeResponse = { role: Role; org_id?: string | null };

function sortItems(a: PositionPowerItem, b: PositionPowerItem): number {
  if (a.level !== b.level) {
    return a.level - b.level;
  }
  if (a.power_level !== b.power_level) {
    return b.power_level - a.power_level;
  }
  return a.title.localeCompare(b.title);
}

export function PositionPowerDashboard() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const meQuery = useQuery({
    queryKey: ["power-control-me"],
    queryFn: () => apiFetch<MeResponse>("/api/me")
  });
  const canViewPowerControls = canAccessSection(meQuery.data?.role, "powerControl");
  const orgId = meQuery.data?.org_id ?? null;

  const powerQuery = useQuery({
    queryKey: ["position-power-levels", orgId],
    queryFn: () => apiFetch<PositionPowerControlsResponse>(`/api/orgs/${orgId}/positions/power-levels`),
    enabled: Boolean(orgId) && canViewPowerControls
  });

  useEffect(() => {
    const items = powerQuery.data?.items ?? [];
    if (items.length === 0) {
      return;
    }

    setDrafts((current) => {
      const next = { ...current };
      for (const item of items) {
        if (next[item.id] === undefined) {
          next[item.id] = String(item.power_level);
        }
      }
      return next;
    });
  }, [powerQuery.data?.items]);

  const updateMutation = useMutation({
    mutationFn: async (params: { positionId: string; powerLevel: number }) =>
      apiFetch<{ power_level: number }>(`/api/orgs/${orgId}/positions/${params.positionId}/power-level`, {
        method: "PATCH",
        body: JSON.stringify({ powerLevel: params.powerLevel })
      }),
    onSuccess: async (_data, variables) => {
      toast.success("Position power level updated.");
      setDrafts((current) => ({
        ...current,
        [variables.positionId]: String(variables.powerLevel)
      }));
      await queryClient.invalidateQueries({ queryKey: ["position-power-levels", orgId] });
      await queryClient.invalidateQueries({ queryKey: ["tree", orgId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unable to update position power level");
    }
  });

  const items = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (powerQuery.data?.items ?? [])
      .slice()
      .sort(sortItems)
      .filter((item) => {
        if (!query) {
          return true;
        }

        return [
          item.title,
          item.department ?? "",
          item.occupant_name ?? "",
          item.occupant_email ?? "",
          item.parent_position_title ?? "",
          item.visibility_scope
        ]
          .join(" ")
          .toLowerCase()
          .includes(query);
      });
  }, [powerQuery.data?.items, search]);

  const editableItems = items.filter((item) => item.can_edit);
  const requesterPowerLevel = powerQuery.data?.requesterPowerLevel ?? 0;
  const maxAssignablePowerLevel = powerQuery.data?.maxAssignablePowerLevel ?? 0;

  return (
    <DashboardPageFrame
      eyebrow="Hierarchy control"
      title="Position power dashboard"
      description="Set subordinate position power levels with the max n-1 rule enforced end to end. Every change is capped below your own power level."
      actions={
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">Requester power {requesterPowerLevel}</Badge>
          <Badge variant="outline">Max assignable {maxAssignablePowerLevel}</Badge>
        </div>
      }
    >
      <div className="space-y-8">
        {!canViewPowerControls ? (
          <div className="rounded-2xl border border-border bg-bg-elevated p-4 text-sm text-text-secondary">
            Power control is available to CEO, CFO, and manager roles only.
          </div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-3">
          <DashboardMetric label="Visible positions" value={items.length} loading={powerQuery.isLoading} tone="info" />
          <DashboardMetric label="Editable positions" value={editableItems.length} loading={powerQuery.isLoading} tone="warning" />
          <DashboardMetric label="My power cap" value={maxAssignablePowerLevel} loading={powerQuery.isLoading} tone="success" />
        </section>

        <DashboardSection
          title="Power controls"
          description="Search visible positions, review their reporting line, and adjust only positions that are below your own level of authority."
        >
          <div className="space-y-4">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search positions, occupants, departments, or parent roles"
              className="max-w-xl"
            />

            {powerQuery.isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : (
              <div className="space-y-3">
                {items.map((item) => {
                  const draftValue = drafts[item.id] ?? String(item.power_level);
                  const parsedDraft = Number.parseInt(draftValue, 10);
                  const nextPowerLevel = Number.isNaN(parsedDraft) ? item.power_level : parsedDraft;
                  const maxAllowed = item.max_allowed_power_level ?? maxAssignablePowerLevel;
                  const isDirty = nextPowerLevel !== item.power_level;
                  const isInvalid = nextPowerLevel < 0 || nextPowerLevel > maxAllowed;

                  return (
                    <article key={item.id} className="rounded-2xl border border-border bg-bg-surface p-4">
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-base font-semibold text-text-primary">{item.title}</p>
                            <Badge variant="outline">Level {item.level}</Badge>
                            <Badge variant="secondary">Power {item.power_level}</Badge>
                            <Badge variant="outline">{item.visibility_scope}</Badge>
                            {item.is_self ? <Badge variant="outline">Your position</Badge> : null}
                          </div>

                          <div className="grid gap-2 text-sm text-text-secondary md:grid-cols-2">
                            <p>
                              <span className="font-medium text-text-primary">Occupant:</span>{" "}
                              {item.occupant_name ?? "Vacant"}
                              {item.occupant_role ? ` (${item.occupant_role})` : ""}
                            </p>
                            <p>
                              <span className="font-medium text-text-primary">Reports to:</span>{" "}
                              {item.parent_position_title ?? "Top level"}
                            </p>
                            <p>
                              <span className="font-medium text-text-primary">Department:</span>{" "}
                              {item.department ?? "Unassigned"}
                            </p>
                            <p>
                              <span className="font-medium text-text-primary">Max allowed here:</span>{" "}
                              {item.can_edit ? maxAllowed : "Read only"}
                            </p>
                          </div>
                        </div>

                        <div className="flex min-w-[260px] flex-col gap-2 rounded-xl border border-border bg-bg-elevated p-3">
                          <label className="text-xs font-semibold uppercase tracking-[0.14em] text-text-secondary">
                            New power level
                          </label>
                          <Input
                            type="number"
                            min={0}
                            max={maxAllowed}
                            value={draftValue}
                            disabled={!item.can_edit || updateMutation.isPending}
                            onChange={(event) =>
                              setDrafts((current) => ({
                                ...current,
                                [item.id]: event.target.value
                              }))
                            }
                          />
                          <p className="text-xs text-text-secondary">
                            Rule: subordinate positions cannot exceed your max n-1 cap of {maxAssignablePowerLevel}.
                          </p>
                          <Button
                            onClick={() => updateMutation.mutate({ positionId: item.id, powerLevel: nextPowerLevel })}
                            disabled={!item.can_edit || !isDirty || isInvalid || updateMutation.isPending}
                          >
                            {updateMutation.isPending ? "Saving..." : "Save power level"}
                          </Button>
                          {!item.can_edit ? (
                            <p className="text-xs text-text-secondary">You can only edit positions below your own authority.</p>
                          ) : null}
                          {item.can_edit && isInvalid ? (
                            <p className="text-xs text-danger">Choose a value between 0 and {maxAllowed}.</p>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  );
                })}

                {items.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border p-5 text-sm text-text-secondary">
                    No positions matched the current search.
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </DashboardSection>
      </div>
    </DashboardPageFrame>
  );
}
