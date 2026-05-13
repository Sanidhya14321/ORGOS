"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { z } from "zod";
import { OnboardingPositionParsePreviewResponseSchema } from "@orgos/shared-types";
import { DashboardPageFrame } from "@/components/dashboard/dashboard-surface";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch, apiUploadFormData, ApiError } from "@/lib/api";
import { useMeQuery } from "@/lib/queries";

type PositionImportPreview = z.infer<typeof OnboardingPositionParsePreviewResponseSchema>;

type ImportResponse = {
  created_positions: number;
  credentials: Array<Record<string, unknown>>;
};

export default function PositionsImportPage() {
  const queryClient = useQueryClient();
  const meQuery = useMeQuery();
  const orgId = meQuery.data?.org_id ?? null;
  const isCeo = meQuery.data?.role === "ceo";

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PositionImportPreview | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importDone, setImportDone] = useState<ImportResponse | null>(null);

  const parseMutation = useMutation({
    mutationFn: async () => {
      if (!orgId || !file) {
        throw new Error("Missing organization or file.");
      }
      const form = new FormData();
      form.set("org_id", orgId);
      form.set("file", file);
      return apiUploadFormData<PositionImportPreview>("/api/onboarding/positions/parse-preview", form);
    },
    onSuccess: (data) => {
      setPreview(data);
      setParseError(null);
      setImportDone(null);
      setImportError(null);
    },
    onError: (err) => {
      setPreview(null);
      setParseError(err instanceof ApiError ? `${err.code}: ${err.message}` : String(err));
    }
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!orgId || !preview) {
        throw new Error("Run preview first.");
      }
      return apiFetch<ImportResponse>("/api/onboarding/positions/import", {
        method: "POST",
        body: JSON.stringify({
          org_id: orgId,
          import_source: "file" as const,
          branches: preview.branches,
          positions: preview.positions
        })
      });
    },
    onSuccess: (data) => {
      setImportDone(data);
      setImportError(null);
      void queryClient.invalidateQueries({ queryKey: ["org-accounts", orgId] });
    },
    onError: (err) => {
      setImportError(err instanceof ApiError ? `${err.code}: ${err.message}` : String(err));
    }
  });

  const statusLine = useMemo(() => {
    if (!preview) return null;
    return `${preview.source_format.toUpperCase()} · ${preview.stats.position_count} positions · ${preview.stats.branch_count} branches`;
  }, [preview]);

  if (meQuery.isLoading) {
    return (
      <DashboardPageFrame eyebrow="People" title="Import positions" description="Loading profile…">
        <Card className="p-6 text-sm text-text-secondary">Loading…</Card>
      </DashboardPageFrame>
    );
  }

  if (!isCeo) {
    return (
      <DashboardPageFrame
        eyebrow="People"
        title="Import positions"
        description="Only the organization CEO can bulk-import positions from a file."
      >
        <Card className="p-6 text-sm text-text-secondary">You do not have access to this page.</Card>
      </DashboardPageFrame>
    );
  }

  return (
    <DashboardPageFrame
      eyebrow="People"
      title="Import positions from file"
      description="Upload CSV, XLSX, DOCX, or PDF with a roster table (title column or pipe-separated rows in extracted text). Preview before creating seats."
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-4 p-5">
          <h2 className="text-lg font-semibold text-text-primary">1. Upload</h2>
          <p className="text-sm text-text-secondary">
            Same parser as onboarding. PDF works when text extraction yields a readable table — prefer CSV/XLSX for complex
            rosters.
          </p>
          <div className="space-y-2">
            <label className="text-sm text-text-secondary">File</label>
            <Input
              type="file"
              accept=".pdf,.docx,.txt,.md,.csv,.xlsx"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setPreview(null);
                setImportDone(null);
              }}
            />
          </div>
          <Button type="button" disabled={!file || !orgId || parseMutation.isPending} onClick={() => parseMutation.mutate()}>
            {parseMutation.isPending ? "Parsing…" : "Preview import"}
          </Button>
          {parseError ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{parseError}</div>
          ) : null}
        </Card>

        <Card className="space-y-4 p-5">
          <h2 className="text-lg font-semibold text-text-primary">2. Preview &amp; commit</h2>
          {!preview ? (
            <p className="text-sm text-text-secondary">Run preview to see parsed branches and positions.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 text-sm text-text-secondary">
                <Badge variant="outline">{statusLine}</Badge>
              </div>
              {preview.warnings.length > 0 ? (
                <ul className="list-inside list-disc text-sm text-amber-600">
                  {preview.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              ) : null}
              <div className="max-h-64 overflow-auto rounded-md border border-border bg-bg-elevated p-3 text-xs font-mono text-text-primary">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-border text-text-secondary">
                      <th className="py-1 pr-2">Title</th>
                      <th className="py-1 pr-2">Dept</th>
                      <th className="py-1 pr-2">Level</th>
                      <th className="py-1 pr-2">Reports to</th>
                      <th className="py-1">Email prefix</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.positions.map((p) => (
                      <tr key={`${p.title}-${p.email_prefix}`} className="border-b border-border/60">
                        <td className="py-1 pr-2">{p.title}</td>
                        <td className="py-1 pr-2">{p.department ?? "—"}</td>
                        <td className="py-1 pr-2">{p.level}</td>
                        <td className="py-1 pr-2">{p.reports_to_title ?? "—"}</td>
                        <td className="py-1">{p.email_prefix}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Button type="button" variant="default" disabled={importMutation.isPending} onClick={() => importMutation.mutate()}>
                {importMutation.isPending ? "Creating…" : "Create positions in org"}
              </Button>
              {importError ? (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                  {importError}
                </div>
              ) : null}
              {importDone ? (
                <p className="text-sm text-text-primary">
                  Created {importDone.created_positions} position(s). Credentials returned in API response — use onboarding export
                  or team tools to distribute access.
                </p>
              ) : null}
            </>
          )}
        </Card>
      </div>
    </DashboardPageFrame>
  );
}
