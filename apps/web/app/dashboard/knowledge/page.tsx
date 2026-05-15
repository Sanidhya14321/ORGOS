"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiFetch, apiUploadFormData, ApiError } from "@/lib/api";
import { canAccessSection } from "@/lib/access";
import { useMeQuery } from "@/lib/queries";

type OrgDocumentRow = {
  id: string;
  file_name: string;
  doc_type: string;
  source_format: string;
  is_indexed: boolean;
  section_count: number;
  page_count: number;
  ingestion_warnings: string[];
  retrieval_mode?: string;
  uploaded_at: string;
};

type DocumentListResponse = {
  documents: OrgDocumentRow[];
  embedding_ingest_available: boolean;
};

type UploadResponse = {
  id: string;
  file_name: string;
  warnings: string[];
  retrieval_mode_requested: string;
  retrieval_mode_stored: string;
  embedding_enqueued: boolean;
};

export default function KnowledgePage() {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [retrievalMode, setRetrievalMode] = useState<"vectorless" | "vector" | "hybrid">("vectorless");
  const [lastUpload, setLastUpload] = useState<UploadResponse | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const meQuery = useMeQuery();

  const orgId = meQuery.data?.org_id ?? null;
  const allowed = canAccessSection(meQuery.data?.role, "knowledge");

  const documentsQuery = useQuery({
    queryKey: ["org-documents", orgId],
    queryFn: () => apiFetch<DocumentListResponse>(`/api/documents/org/${orgId}`),
    enabled: Boolean(orgId) && allowed
  });

  const embeddingIngestAvailable = documentsQuery.data?.embedding_ingest_available;

  useEffect(() => {
    if (embeddingIngestAvailable === false) {
      setRetrievalMode("vectorless");
    }
  }, [embeddingIngestAvailable]);

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!orgId || !file) {
        throw new Error("Select a file and ensure your profile is linked to an organization.");
      }
      const form = new FormData();
      form.set("org_id", orgId);
      form.set("doc_type", "handbook");
      form.set("retrieval_mode", retrievalMode);
      form.set("file", file);
      return apiUploadFormData<UploadResponse>("/api/documents/upload", form);
    },
    onSuccess: (data) => {
      setLastUpload(data);
      setUploadError(null);
      void queryClient.invalidateQueries({ queryKey: ["org-documents", orgId] });
    },
    onError: (err) => {
      setLastUpload(null);
      setUploadError(err instanceof ApiError ? `${err.code}: ${err.message}` : String(err));
    }
  });

  const statusLine = useMemo(() => {
    if (!lastUpload) return null;
    return `Stored mode: ${lastUpload.retrieval_mode_stored} (requested ${lastUpload.retrieval_mode_requested}). Embedding job enqueued: ${lastUpload.embedding_enqueued ? "yes" : "no"}.`;
  }, [lastUpload]);

  if (meQuery.isLoading) {
    return (
      <AppShell eyebrow="Knowledge" title="Knowledge base" description="Loading…">
        <Card className="p-6 text-sm text-text-secondary">Loading profile…</Card>
      </AppShell>
    );
  }

  if (!allowed) {
    return (
      <AppShell
        eyebrow="Knowledge"
        title="Knowledge base"
        description="Only the organization CEO can manage company documents."
        role={meQuery.data?.role}
      >
        <Card className="p-6 text-sm text-text-secondary">You do not have access to this page.</Card>
      </AppShell>
    );
  }

  return (
    <AppShell
      eyebrow="Knowledge"
      title="Knowledge base"
      description="Upload handbooks and policies for vectorless or embedding-backed retrieval."
      role={meQuery.data?.role}
    >
      <div className="min-w-0 grid gap-6 lg:grid-cols-2">
        <Card className="space-y-4 p-5">
          <h2 className="text-lg font-semibold text-text-primary">Upload</h2>
          {embeddingIngestAvailable === false ? (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
              Vector and hybrid are turned off here because the API has no <code className="rounded bg-bg-subtle px-1">OPENAI_API_KEY</code>{" "}
              (embeddings path). Uploads use <strong>vectorless</strong> only until that is set. Groq alone does not supply embeddings.
            </div>
          ) : null}
          <div className="space-y-2">
            <label className="text-sm text-text-secondary">Retrieval mode</label>
            <Select value={retrievalMode} onValueChange={(v) => setRetrievalMode(v as typeof retrievalMode)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="vectorless">Vectorless (sections only)</SelectItem>
                <SelectItem value="vector" disabled={embeddingIngestAvailable === false}>
                  Vector (embeddings)
                </SelectItem>
                <SelectItem value="hybrid" disabled={embeddingIngestAvailable === false}>
                  Hybrid
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-text-muted">
              Agents use <strong>Groq</strong> on the server when <code className="rounded bg-bg-subtle px-1">GROQ_API_KEY</code> is set.
              Vector / hybrid modes need embeddings — today that path uses <code className="rounded bg-bg-subtle px-1">OPENAI_API_KEY</code> on the API; without it, upload stays <strong>vectorless</strong> (sections only).
            </p>
          </div>
          <div className="space-y-2">
            <label className="text-sm text-text-secondary">File</label>
            <Input type="file" accept=".pdf,.docx,.txt,.md,.csv,.xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          <Button type="button" disabled={!file || uploadMutation.isPending} onClick={() => uploadMutation.mutate()}>
            {uploadMutation.isPending ? "Uploading…" : "Upload document"}
          </Button>
          {uploadError ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{uploadError}</div>
          ) : null}
          {lastUpload ? (
            <div className="space-y-2 rounded-md border border-border bg-bg-elevated p-3 text-sm">
              <div className="font-medium text-text-primary">Last upload: {lastUpload.file_name}</div>
              <div className="text-text-secondary">{statusLine}</div>
              {lastUpload.warnings.length > 0 ? (
                <ul className="list-inside list-disc text-amber-600">
                  {lastUpload.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </Card>

        <Card className="space-y-4 p-5">
          <h2 className="text-lg font-semibold text-text-primary">Library</h2>
          {documentsQuery.isLoading ? <p className="text-sm text-text-secondary">Loading documents…</p> : null}
          {documentsQuery.error ? (
            <p className="text-sm text-destructive">{(documentsQuery.error as Error).message}</p>
          ) : null}
          <ul className="space-y-3">
            {(documentsQuery.data?.documents ?? []).map((doc) => (
              <li key={doc.id} className="rounded-md border border-border bg-bg-elevated p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-text-primary">{doc.file_name}</span>
                  <Badge variant="outline">{doc.source_format}</Badge>
                  {doc.is_indexed ? <Badge variant="default">Indexed</Badge> : <Badge variant="secondary">Pending</Badge>}
                  {doc.retrieval_mode ? <Badge variant="outline">{doc.retrieval_mode}</Badge> : null}
                </div>
                <div className="mt-1 text-xs text-text-muted">
                  Sections: {doc.section_count} · Pages: {doc.page_count}
                </div>
                {doc.ingestion_warnings.length > 0 ? (
                  <ul className="mt-2 list-inside list-disc text-amber-600">
                    {doc.ingestion_warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
          {(documentsQuery.data?.documents ?? []).length === 0 && !documentsQuery.isLoading ? (
            <p className="text-sm text-text-secondary">No documents yet.</p>
          ) : null}
          {(documentsQuery.data?.documents ?? []).length > 1 ? (
            <p className="text-xs text-text-muted">
              Multiple rows with the same file name mean separate uploads; each is its own document. Use vectorless unless the API has{" "}
              <code className="rounded bg-bg-subtle px-1">OPENAI_API_KEY</code> for embeddings.
            </p>
          ) : null}
        </Card>
      </div>
    </AppShell>
  );
}
