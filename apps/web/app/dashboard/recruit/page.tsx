"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { apiFetch } from "@/lib/api";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ApplicantCard } from "@/components/recruit/applicant-card";
import { KanbanView } from "@/components/recruit/kanban-view";
import { MetricCard } from "@/components/dashboard/metric-card";
import type { Applicant, Job } from "@/lib/models";

const ApplicantDrawer = dynamic(
  () => import("@/components/recruit/applicant-drawer").then((m) => m.ApplicantDrawer),
  { ssr: false }
);

function VirtualApplicantCards({ applicants, onOpen }: { applicants: Applicant[]; onOpen: (id: string) => void }) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const rowVirtualizer = useVirtualizer({
    count: applicants.length,
    getScrollElement: () => container,
    estimateSize: () => 210,
    overscan: 6
  });

  return (
    <div ref={setContainer} className="max-h-[65vh] overflow-auto">
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

  const jobsQuery = useQuery({
    queryKey: ["recruitment-jobs"],
    queryFn: () => apiFetch<{ items: Job[] }>("/api/recruitment/jobs?limit=100"),
    select: (data) => data.items
  });

  const selectedJob = useMemo(
    () => (jobsQuery.data ?? [])[0] && !selectedJobId ? (jobsQuery.data ?? [])[0] : (jobsQuery.data ?? []).find((job) => job.id === selectedJobId),
    [jobsQuery.data, selectedJobId]
  );

  const applicantsQuery = useQuery({
    queryKey: ["applicants", selectedJob?.id],
    queryFn: () => apiFetch<{ items: Applicant[] }>(`/api/recruitment/jobs/${selectedJob?.id}/applicants`),
    select: (data) => data.items,
    enabled: Boolean(selectedJob?.id)
  });

  const selectedApplicant = useMemo(
    () => (applicantsQuery.data ?? []).find((item) => item.id === selectedApplicantId) ?? null,
    [applicantsQuery.data, selectedApplicantId]
  );

  const applicants = applicantsQuery.data ?? [];
  const avgScore = Math.round((applicants.reduce((sum, item) => sum + (item.ai_score ?? 0), 0) / Math.max(applicants.length, 1)) * 100);

  return (
    <div className="space-y-5">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Open Positions" value={(jobsQuery.data ?? []).filter((j) => j.status === "open").length} loading={jobsQuery.isLoading} />
        <MetricCard label="Total Applicants" value={applicants.length} loading={applicantsQuery.isLoading} />
        <MetricCard label="Avg AI Score" value={avgScore} loading={applicantsQuery.isLoading} />
        <MetricCard label="Referrals This Month" value={applicants.filter((a) => a.source === "referral").length} loading={applicantsQuery.isLoading} />
      </section>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <aside className="rounded-md border border-border bg-bg-surface p-3">
          <p className="mb-2 text-sm font-semibold text-text-primary">Jobs</p>
          <div className="space-y-2">
            {jobsQuery.isLoading ? (
              <>
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </>
            ) : (
              (jobsQuery.data ?? []).map((job) => (
                <button
                  key={job.id}
                  type="button"
                  onClick={() => setSelectedJobId(job.id)}
                  className={`focus-ring w-full rounded-md border px-3 py-2 text-left ${selectedJob?.id === job.id ? "border-accent bg-accent-subtle text-accent" : "border-border bg-bg-subtle text-text-secondary"}`}
                >
                  <p className="text-sm font-medium">{job.title}</p>
                  <p className="text-xs">{job.department}</p>
                </button>
              ))
            )}
          </div>
        </aside>

        <section className="rounded-md border border-border bg-bg-surface p-3">
          <Tabs defaultValue="cards">
            <TabsList>
              <TabsTrigger value="cards">Cards</TabsTrigger>
              <TabsTrigger value="kanban">Kanban</TabsTrigger>
            </TabsList>
            <TabsContent value="cards" className="mt-3 space-y-3">
              {applicantsQuery.isLoading ? (
                <>
                  <Skeleton className="h-40 w-full" />
                  <Skeleton className="h-40 w-full" />
                </>
              ) : (
                <VirtualApplicantCards applicants={applicants} onOpen={setSelectedApplicantId} />
              )}
            </TabsContent>
            <TabsContent value="kanban" className="mt-3">
              <KanbanView applicants={applicants} onOpen={setSelectedApplicantId} />
            </TabsContent>
          </Tabs>
        </section>
      </div>

      <ApplicantDrawer applicant={selectedApplicant} open={Boolean(selectedApplicant)} onOpenChange={(open) => !open && setSelectedApplicantId(null)} />
    </div>
  );
}
