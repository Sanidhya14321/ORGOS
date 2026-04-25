"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Document, Page, pdfjs } from "react-pdf";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import type { Applicant, ApplicantStage } from "@/lib/models";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;

const stageOrder: ApplicantStage[] = ["applied", "screening", "interview", "offer", "hired", "rejected"];

export function ApplicantDrawer({
  applicant,
  open,
  onOpenChange
}: {
  applicant: Applicant | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [pdfPage, setPdfPage] = useState(1);

  const interviewsQuery = useQuery({
    queryKey: ["applicant-interviews", applicant?.id],
    queryFn: () => apiFetch<{ items: Array<{ id: string; round_name: string; score?: number; feedback?: string; scheduled_at: string }> }>(`/api/recruitment/applicants/${applicant?.id}/interviews`),
    select: (data) => data.items,
    enabled: Boolean(applicant?.id && open)
  });

  const stageMutation = useMutation({
    mutationFn: (stage: ApplicantStage) =>
      apiFetch(`/api/recruitment/applicants/${applicant?.id}/stage`, {
        method: "PATCH",
        body: JSON.stringify({ stage })
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["applicants"] });
    }
  });

  if (!applicant) return null;

  const nextStage = stageOrder[Math.min(stageOrder.indexOf(applicant.stage) + 1, stageOrder.length - 1)];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="max-w-[640px]">
        <ScrollArea className="h-full pr-4">
          <SheetHeader>
            <SheetTitle>{applicant.full_name}</SheetTitle>
          </SheetHeader>

          <div className="mt-4 space-y-4">
            <div className="rounded-md border border-border bg-bg-subtle p-3">
              <p className="text-xs text-text-secondary">AI score</p>
              <p className="text-2xl font-semibold text-text-primary">{Math.round((applicant.ai_score ?? 0) * 100)}%</p>
              <p className="mt-1 text-sm text-text-secondary">{applicant.ai_summary ?? "No AI summary yet."}</p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-text-primary">Resume</p>
              <div className="rounded-md border border-border bg-bg-subtle p-2">
                {applicant.id ? (
                  <Document file={null} loading={<Skeleton className="h-56 w-full" />}>
                    <Page pageNumber={pdfPage} width={560} />
                  </Document>
                ) : (
                  <p className="text-xs text-text-secondary">No resume uploaded</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-text-primary">Interviews</p>
              {interviewsQuery.isLoading ? (
                <Skeleton className="h-20 w-full" />
              ) : (
                <div className="space-y-2">
                  {(interviewsQuery.data ?? []).map((interview) => (
                    <div key={interview.id} className="rounded border border-border bg-bg-subtle p-3">
                      <p className="text-sm text-text-primary">{interview.round_name}</p>
                      <p className="text-xs text-text-secondary">{new Date(interview.scheduled_at).toLocaleString()} · score {interview.score ?? "n/a"}</p>
                      {interview.feedback ? <p className="mt-1 text-xs text-text-secondary">{interview.feedback}</p> : null}
                    </div>
                  ))}
                  {(interviewsQuery.data ?? []).length === 0 ? <p className="text-xs text-text-secondary">No interviews yet</p> : null}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Badge className="bg-bg-subtle text-text-secondary">{applicant.stage}</Badge>
              <Button className="bg-accent hover:bg-accent-hover" onClick={() => stageMutation.mutate(nextStage)}>
                Move to {nextStage}
              </Button>
              <Button variant="outline" className="border-danger text-danger" onClick={() => stageMutation.mutate("rejected")}>Reject</Button>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
