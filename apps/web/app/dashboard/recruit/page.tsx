"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { apiFetch } from "@/lib/api";
import { canAccessSection } from "@/lib/access";
import { DashboardPageFrame } from "@/components/dashboard/dashboard-surface";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ApplicantCard } from "@/components/recruit/applicant-card";
import { KanbanView } from "@/components/recruit/kanban-view";
import { MetricCard } from "@/components/dashboard/metric-card";
import type { Applicant, Job, Role } from "@/lib/models";

const ApplicantDrawer = dynamic(
  () => import("@/components/recruit/applicant-drawer").then((m) => m.ApplicantDrawer),
  { ssr: false }
);

type MeResponse = {
  role: Role;
};

function VirtualApplicantCards({ applicants, onOpen }: { applicants: Applicant[]; onOpen: (id: string) => void }) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const rowVirtualizer = useVirtualizer({
    count: applicants.length,
    getScrollElement: () => container,
    estimateSize: () => 210,
    overscan: 6
  });

  return (
    <div ref={setContainer} className="max-h-[65vh] min-w-0 overflow-auto">
      <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: "relative" }}>
        {rowVirtualizer.getVirtualItems().map((item) => {
          const applicant = applicants[item.index];
          return (
            <div
              key={applicant.id}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${item.start}px)`
              }}
              className="pb-3"
            >
              <ApplicantCard applicant={applicant} onOpen={onOpen} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function RecruitDashboardPage() {
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedApplicantId, setSelectedApplicantId] = useState<string | null>(null);
  const meQuery = useQuery({
    queryKey: ["me", "recruit-dashboard"],
    queryFn: () => apiFetch<MeResponse>("/api/me")
  });
  const canViewRecruitment = canAccessSection(meQuery.data?.role, "recruitment");

  const jobsQuery = useQuery({
    queryKey: ["recruitment-jobs"],
    queryFn: () => apiFetch<{ items: Job[] }>("/api/recruitment/jobs?limit=100"),
    select: (data) => data.items,
    enabled: canViewRecruitment
  });

  const selectedJob = useMemo(
    () => (jobsQuery.data ?? [])[0] && !selectedJobId ? (jobsQuery.data ?? [])[0] : (jobsQuery.data ?? []).find((job) => job.id === selectedJobId),
    [jobsQuery.data, selectedJobId]
  );

  const applicantsQuery = useQuery({
    queryKey: ["applicants", selectedJob?.id],
    queryFn: () => apiFetch<{ items: Applicant[] }>(`/api/recruitment/jobs/${selectedJob?.id}/applicants`),
    select: (data) => data.items,
    enabled: canViewRecruitment && Boolean(selectedJob?.id)
  });

  const selectedApplicant = useMemo(
    () => (applicantsQuery.data ?? []).find((item) => item.id === selectedApplicantId) ?? null,
    [applicantsQuery.data, selectedApplicantId]
  );

  const applicants = applicantsQuery.data ?? [];
  const avgScore = Math.round((applicants.reduce((sum, item) => sum + (item.ai_score ?? 0), 0) / Math.max(applicants.length, 1)) * 100);

  return (
    <DashboardPageFrame
      eyebrow="Recruitment"
      title="Hiring pipeline"
      description="Track open roles, candidate quality, and stage distribution without leaving the main operating workspace."
      actions={
        <Badge variant="outline" className="border-border bg-bg-elevated text-text-secondary">
          {selectedJob ? selectedJob.title : "Select a role"}
        </Badge>
      }
    >
      <div className="min-w-0 space-y-6">
        {!canViewRecruitment ? (
          <Card className="p-4 text-sm text-text-secondary">
            Recruitment dashboards are available to CEO, CFO, and manager roles.
          </Card>
        ) : null}

        <section className="min-w-0 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Open Positions" value={(jobsQuery.data ?? []).filter((j) => j.status === "open").length} loading={jobsQuery.isLoading} />
          <MetricCard label="Total Applicants" value={applicants.length} loading={applicantsQuery.isLoading} />
          <MetricCard label="Avg AI Score" value={avgScore} loading={applicantsQuery.isLoading} />
          <MetricCard label="Referrals This Month" value={applicants.filter((a) => a.source === "referral").length} loading={applicantsQuery.isLoading} />
        </section>

        <section className="min-w-0 grid gap-4 xl:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
          <Card className="p-4">
            <div className="mb-4 space-y-1">
              <p className="dashboard-label">Open roles</p>
              <p className="text-sm text-text-secondary">Choose a role to inspect its applicant queue.</p>
            </div>

            <div className="space-y-2">
              {jobsQuery.isLoading ? (
                <>
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </>
              ) : (
                (jobsQuery.data ?? []).map((job) => (
                  <button
                    key={job.id}
                    type="button"
                    onClick={() => setSelectedJobId(job.id)}
                    className={`focus-ring w-full rounded-2xl border px-4 py-3 text-left transition ${selectedJob?.id === job.id ? "border-accent bg-accent-subtle text-text-primary shadow-[0_12px_24px_rgba(var(--accent-rgb),0.14)]" : "border-border bg-bg-elevated text-text-secondary hover:bg-bg-surface hover:text-text-primary"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">{job.title}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.18em]">{job.department}</p>
                      </div>
                      <Badge variant="outline">{job.status}</Badge>
                    </div>
                  </button>
                ))
              )}
            </div>
          </Card>

          <Card className="p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="dashboard-label">Applicant review</p>
                <p className="mt-1 text-sm text-text-secondary">Switch between a card queue and stage-based pipeline.</p>
              </div>
              <Badge variant="secondary">{applicants.length} applicants</Badge>
            </div>

            <Tabs defaultValue="cards">
              <TabsList>
                <TabsTrigger value="cards">Cards</TabsTrigger>
                <TabsTrigger value="kanban">Kanban</TabsTrigger>
              </TabsList>
              <TabsContent value="cards" className="mt-4 space-y-3">
                {applicantsQuery.isLoading ? (
                  <>
                    <Skeleton className="h-40 w-full" />
                    <Skeleton className="h-40 w-full" />
                  </>
                ) : applicants.length > 0 ? (
                  <VirtualApplicantCards applicants={applicants} onOpen={setSelectedApplicantId} />
                ) : (
                  <div className="rounded-2xl border border-dashed border-border bg-bg-elevated p-8 text-center text-sm text-text-secondary">
                    No applicants yet for this role.
                  </div>
                )}
              </TabsContent>
              <TabsContent value="kanban" className="mt-4">
                <KanbanView applicants={applicants} onOpen={setSelectedApplicantId} />
              </TabsContent>
            </Tabs>
          </Card>
        </section>

        <ApplicantDrawer applicant={selectedApplicant} open={Boolean(selectedApplicant)} onOpenChange={(open) => !open && setSelectedApplicantId(null)} />
      </div>
    </DashboardPageFrame>
  );
}
