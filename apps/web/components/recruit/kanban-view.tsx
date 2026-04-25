"use client";

import { useMemo } from "react";
import type { Applicant, ApplicantStage } from "@/lib/models";
import { ApplicantCard } from "@/components/recruit/applicant-card";

const columns: ApplicantStage[] = ["applied", "screening", "interview", "offer", "hired", "rejected"];

export function KanbanView({ applicants, onOpen }: { applicants: Applicant[]; onOpen: (id: string) => void }) {
  const grouped = useMemo(() => {
    const map = new Map<ApplicantStage, Applicant[]>();
    for (const col of columns) map.set(col, []);
    for (const applicant of applicants) {
      map.get(applicant.stage)?.push(applicant);
    }
    return map;
  }, [applicants]);

  return (
    <div className="grid gap-3 xl:grid-cols-6">
      {columns.map((column) => (
        <section key={column} className="rounded-md border border-border bg-bg-surface p-2">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs uppercase text-text-secondary">{column}</p>
            <span className="rounded bg-bg-subtle px-1.5 py-0.5 text-[11px] text-text-secondary">{grouped.get(column)?.length ?? 0}</span>
          </div>
          <div className="space-y-2">
            {(grouped.get(column) ?? []).map((applicant) => (
              <ApplicantCard key={applicant.id} applicant={applicant} onOpen={onOpen} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
