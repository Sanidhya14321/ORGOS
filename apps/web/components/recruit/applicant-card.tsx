"use client";

import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { Applicant } from "@/lib/models";

export function ApplicantCard({ applicant, onOpen }: { applicant: Applicant; onOpen: (id: string) => void }) {
  const score = Math.round((applicant.ai_score ?? 0) * 100);

  return (
    <button
      type="button"
      onClick={() => onOpen(applicant.id)}
      className="w-full rounded-[24px] border border-border bg-bg-surface p-5 text-left shadow-[0_16px_40px_rgba(23,21,19,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-bg-elevated"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-text-primary">{applicant.full_name}</p>
          <p className="text-xs text-text-secondary">{applicant.email}</p>
        </div>
        <p className="text-xs text-text-muted">{formatDistanceToNow(new Date(applicant.applied_at), { addSuffix: true })}</p>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <Badge variant="outline">{applicant.stage}</Badge>
        <Badge variant="secondary">{applicant.source}</Badge>
      </div>

      <div className="mt-3 space-y-1">
        <p className="text-xs text-text-secondary">AI score {score}%</p>
        <Progress value={score} />
      </div>

      <p className="mt-3 line-clamp-2 text-sm text-text-secondary">{applicant.ai_summary ?? "No AI summary yet."}</p>
    </button>
  );
}
