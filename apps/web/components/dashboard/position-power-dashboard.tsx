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
  const [selectedDepartment, setSelectedDepartment] = useState("All");
  const [currentPage, setCurrentPage] = useState(1);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const ITEMS_PER_PAGE = 5;

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

  // Reset pagination safely back to page 1 whenever filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, selectedDepartment]);

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

  // Extract unique departments for the dropdown list dynamically
  const uniqueDepartments = useMemo(() => {
    const set = new Set<string>();
    const rawItems = powerQuery.data?.items ?? [];
    for (const item of rawItems) {
      if (item.department) {
        set.add(item.department);
      }
    }
    return Array.from(set).sort();
  }, [powerQuery.data?.items]);

  // Process sorting, global search filtering, and department filtering
  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (powerQuery.data?.items ?? [])
      .slice()
      .sort(sortItems)
      .filter((item) => {
        // 1. Department Filter Boundary
        if (selectedDepartment !== "All" && item.department !== selectedDepartment) {
          return false;
        }

        // 2. Search Box Query Filter
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
  }, [powerQuery.data?.items, search, selectedDepartment]);

  // Handle precise pagination calculation subsets
  const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE);
  
  const paginatedItems = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredItems.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredItems, currentPage]);

  const editableItems = filteredItems.filter((item) => item.can_edit);
  const requesterPowerLevel = powerQuery.data?.requesterPowerLevel ?? 0;
  const maxAssignablePowerLevel = powerQuery.data?.maxAssignablePowerLevel ?? 0;

  return (
    <DashboardPageFrame
      eyebrow="Hierarchy Control"
      title="Position Power Dashboard"
      description="Set subordinate position power levels with the max n-1 rule enforced end to end. Every change is capped below your own power level."
      actions={
        <div className="flex flex-wrap gap-2 sm:mt-0">
          <Badge variant="secondary" className="px-3 py-1 text-xs font-medium tracking-wide">
            Requester Power: {requesterPowerLevel}
          </Badge>
          <Badge variant="outline" className="px-3 py-1 text-xs font-medium tracking-wide border-border/80">
            Max Assignable: {maxAssignablePowerLevel}
          </Badge>
        </div>
      }
    >
      <div className="min-w-0 space-y-8">
        {!canViewPowerControls ? (
          <div className="flex items-center gap-3 rounded-xl border border-border bg-bg-elevated p-4 text-sm text-text-secondary shadow-sm">
            <svg className="h-5 w-5 text-text-secondary/70 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m0 4h.01M5.071 19.071c2.441-2.441 5.71-3.411 8.929-2.914m4.929 2.914c-2.441-2.441-5.71-3.411-8.929-2.914m0-12.828A4.993 4.993 0 0112 15V3m0 0L8 7m4-4l4 4" />
            </svg>
            <p>Power control tools are restricted. Available to CEO, CFO, and structural manager roles only.</p>
          </div>
        ) : null}

        <section className="min-w-0 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
          <DashboardMetric label="Visible Positions" value={filteredItems.length} loading={powerQuery.isLoading} tone="info" />
          <DashboardMetric label="Editable Positions" value={editableItems.length} loading={powerQuery.isLoading} tone="warning" />
          <DashboardMetric label="My Power Cap" value={maxAssignablePowerLevel} loading={powerQuery.isLoading} tone="success" />
        </section>

        <DashboardSection
          title="Power Controls"
          description="Search visible positions, review their reporting line metrics, and update authority bounds for valid downstream roles."
        >
          <div className="space-y-6">
            {/* Context Filters Layout */}
            <div className="flex flex-col sm:flex-row gap-3 max-w-2xl">
              <div className="relative flex-1 group">
                <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-text-secondary/50 group-focus-within:text-text-primary transition-colors">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </span>
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search positions, occupants, or parent roles..."
                  className="pl-9 h-10 transition-all border-border hover:border-border/80 focus-visible:ring-1"
                />
              </div>

              <select
                value={selectedDepartment}
                onChange={(e) => setSelectedDepartment(e.target.value)}
                className="h-10 px-3 rounded-md border border-border bg-bg-surface text-sm text-text-primary focus-visible:ring-1 focus-visible:ring-primary outline-none transition-all hover:border-border/80 min-w-[180px] cursor-pointer"
              >
                <option value="All">All Departments</option>
                {uniqueDepartments.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
            </div>

            {powerQuery.isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-32 w-full rounded-2xl" />
                <Skeleton className="h-32 w-full rounded-2xl" />
                <Skeleton className="h-32 w-full rounded-2xl" />
              </div>
            ) : (
              <div className="space-y-4">
                {paginatedItems.map((item) => {
                  const draftValue = drafts[item.id] ?? String(item.power_level);
                  const parsedDraft = Number.parseInt(draftValue, 10);
                  const nextPowerLevel = Number.isNaN(parsedDraft) ? item.power_level : parsedDraft;
                  const maxAllowed = item.max_allowed_power_level ?? maxAssignablePowerLevel;
                  const isDirty = nextPowerLevel !== item.power_level;
                  const isInvalid = nextPowerLevel < 0 || nextPowerLevel > maxAllowed;

                  return (
                    <article 
                      key={item.id} 
                      className={`group/card rounded-2xl border bg-bg-surface p-5 transition-all duration-200 hover:shadow-sm hover:border-border/80 ${
                        item.is_self ? "border-l-4 border-l-primary border-t-border border-r-border border-b-border" : "border-border"
                      }`}
                    >
                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                        {/* Left Metadata Side */}
                        <div className="space-y-4 lg:col-span-7 xl:col-span-8">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-base font-semibold tracking-tight text-text-primary">
                              {item.title}
                            </h4>
                            <div className="flex flex-wrap gap-1.5 items-center">
                              <Badge variant="outline" className="text-xs font-normal border-border bg-bg-elevated/40">
                                Level {item.level}
                              </Badge>
                              <Badge variant="secondary" className="text-xs font-medium">
                                Power {item.power_level}
                              </Badge>
                              <Badge variant="outline" className="text-xs font-normal text-text-secondary border-border/60">
                                {item.visibility_scope}
                              </Badge>
                              {item.is_self ? (
                                <Badge className="text-xs font-semibold tracking-wide bg-primary/10 text-primary hover:bg-primary/10 border-transparent">
                                  Your Position
                                </Badge>
                              ) : null}
                            </div>
                          </div>

                          <div className="grid gap-x-4 gap-y-3 text-sm md:grid-cols-2 border-t border-border/40 pt-3">
                            <div className="space-y-0.5">
                              <span className="text-xs font-medium uppercase tracking-wider text-text-secondary/70">Occupant</span>
                              <p className="text-text-primary font-medium">
                                {item.occupant_name ?? <span className="text-text-secondary font-normal italic">Vacant</span>}
                                {item.occupant_role ? <span className="text-xs text-text-secondary font-normal ml-1">({item.occupant_role})</span> : ""}
                              </p>
                            </div>
                            <div className="space-y-0.5">
                              <span className="text-xs font-medium uppercase tracking-wider text-text-secondary/70">Reports To</span>
                              <p className="text-text-primary font-medium">
                                {item.parent_position_title ?? <span className="text-xs text-text-secondary font-normal tracking-wide uppercase bg-bg-elevated px-1.5 py-0.5 rounded">Top Level</span>}
                              </p>
                            </div>
                            <div className="space-y-0.5">
                              <span className="text-xs font-medium uppercase tracking-wider text-text-secondary/70">Department</span>
                              <p className="text-text-primary font-medium">
                                {item.department ?? <span className="text-text-secondary font-normal italic">Unassigned</span>}
                              </p>
                            </div>
                            <div className="space-y-0.5">
                              <span className="text-xs font-medium uppercase tracking-wider text-text-secondary/70">Max Assignable Threshold</span>
                              <p className={`font-semibold ${item.can_edit ? "text-text-primary" : "text-text-secondary/60 font-normal"}`}>
                                {item.can_edit ? maxAllowed : "Read-Only"}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Right Action Bounds Side */}
                        <div className="flex flex-col gap-2 rounded-xl border border-border/80 bg-bg-elevated p-4 lg:col-span-5 xl:col-span-4 transition-colors group-hover/card:bg-bg-elevated/70">
                          <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-text-secondary/80">
                            Configure Power Level
                          </label>
                          <div className="relative">
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
                              className="h-9 transition-all font-medium border-border focus-visible:ring-1 disabled:opacity-60"
                            />
                          </div>
                          
                          <p className="text-xs leading-relaxed text-text-secondary/90">
                            Subordinate bounds cannot exceed your global structural cap of <span className="font-semibold text-text-primary">{maxAssignablePowerLevel}</span>.
                          </p>

                          <Button
                            size="sm"
                            onClick={() => updateMutation.mutate({ positionId: item.id, powerLevel: nextPowerLevel })}
                            disabled={!item.can_edit || !isDirty || isInvalid || updateMutation.isPending}
                            className="mt-1 font-medium transition-all w-full shadow-sm active:scale-[0.99]"
                          >
                            {updateMutation.isPending ? "Saving changes..." : "Save Power Level"}
                          </Button>

                          {!item.can_edit ? (
                            <p className="text-[11px] text-center text-text-secondary/70 pt-0.5">
                              🔒 Actions restricted to lower authority targets.
                            </p>
                          ) : null}
                          
                          {item.can_edit && isInvalid ? (
                            <p className="text-[11px] font-medium text-danger text-center bg-danger/5 py-1 rounded border border-danger/10 animate-pulse">
                              Value must be between 0 and {maxAllowed}.
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  );
                })}

                {/* Empty State Illustration Block */}
                {filteredItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center text-center rounded-2xl border border-dashed border-border p-10 bg-bg-surface/50">
                    <svg className="h-8 w-8 text-text-secondary/40 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-sm font-medium text-text-primary">No positions found</p>
                    <p className="text-xs text-text-secondary max-w-xs mt-1">
                      No roles match the selected criteria. Try resetting or changing your department or search keywords.
                    </p>
                  </div>
                ) : null}

                {/* Pagination Controls Interface Footer */}
                {totalPages > 1 ? (
                  <div className="flex items-center justify-between border-t border-border/60 pt-4 mt-6">
                    <p className="text-xs text-text-secondary font-medium">
                      Showing <span className="text-text-primary">{(currentPage - 1) * ITEMS_PER_PAGE + 1}</span> to{" "}
                      <span className="text-text-primary">
                        {Math.min(currentPage * ITEMS_PER_PAGE, filteredItems.length)}
                      </span>{" "}
                      of <span className="text-text-primary">{filteredItems.length}</span> positions
                    </p>

                    <div className="flex items-center gap-1.5">
                      {/* Left Button */}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-8 p-0 border-border"
                        onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                        disabled={currentPage === 1}
                      >
                        <span className="sr-only">Previous Page</span>
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                        </svg>
                      </Button>

                      {/* Numeric Page Indicators */}
                      {Array.from({ length: totalPages }, (_, index) => {
                        const pageNum = index + 1;
                        const isActive = pageNum === currentPage;
                        return (
                          <Button
                            key={pageNum}
                            variant={isActive ? "default" : "outline"}
                            size="sm"
                            className={`h-8 w-8 p-0 text-xs font-semibold transition-all ${
                              !isActive ? "border-border text-text-secondary hover:text-text-primary" : ""
                            }`}
                            onClick={() => setCurrentPage(pageNum)}
                          >
                            {pageNum}
                          </Button>
                        );
                      })}

                      {/* Right Button */}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-8 p-0 border-border"
                        onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                        disabled={currentPage === totalPages}
                      >
                        <span className="sr-only">Next Page</span>
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </Button>
                    </div>
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