"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AuthPageShell } from "@/components/auth/auth-page-shell";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { useMeQuery } from "@/lib/queries";

export default function OrgSetupPage() {
  const router = useRouter();
  const meQuery = useMeQuery();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const orgId = meQuery.data?.org_id;
  const setup = meQuery.data?.org_setup;

  async function completeMilestone(kind: "positions" | "company_docs") {
    if (!orgId) {
      setError("No organization on your profile.");
      return;
    }
    setBusy(kind);
    setError(null);
    try {
      await apiFetch(`/api/orgs/${orgId}/setup-milestone`, {
        method: "POST",
        body: JSON.stringify({ kind })
      });
      await meQuery.refetch();
      if (kind === "positions" && setup && !setup.company_docs_complete) {
        setBusy(null);
        return;
      }
      router.replace("/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <AuthPageShell
      eyebrow="ORGOS setup"
      title="Finish organization setup"
      description="Confirm positions and company documents so goals and RAG run on real org context."
    >
      <div className="space-y-4 text-sm text-text-secondary">
        <div className="rounded-2xl border border-border bg-bg-elevated p-4">
          <p className="font-medium text-text-primary">1. Positions</p>
          <p className="mt-1">Import or create at least one position for your org (CEO onboarding or Positions import).</p>
          <Button
            className="mt-3"
            disabled={!orgId || busy !== null}
            onClick={() => void completeMilestone("positions")}
          >
            {busy === "positions" ? "Checking…" : "Mark positions complete"}
          </Button>
        </div>
        <div className="rounded-2xl border border-border bg-bg-elevated p-4">
          <p className="font-medium text-text-primary">2. Company documents</p>
          <p className="mt-1">Upload at least one document to the knowledge base for your organization.</p>
          <Button
            className="mt-3"
            variant="secondary"
            disabled={!orgId || busy !== null}
            onClick={() => void completeMilestone("company_docs")}
          >
            {busy === "company_docs" ? "Checking…" : "Mark documents complete"}
          </Button>
        </div>
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
        <Button variant="ghost" className="w-full" onClick={() => router.push("/dashboard/knowledge")}>
          Open knowledge base
        </Button>
      </div>
    </AuthPageShell>
  );
}
