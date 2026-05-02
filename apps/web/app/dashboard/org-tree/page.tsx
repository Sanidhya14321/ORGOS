"use client";

import { useState, useEffect } from "react";
import { OrgTree } from "@/components/tree/org-tree";
import { apiFetch } from "@/lib/api";
import type { Role } from "@/lib/models";

const allowedRoles: Role[] = ["ceo", "cfo", "manager"];

export default function OrgTreePage() {
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;

    void (async () => {
      try {
        const me = await apiFetch<{ role?: Role }>("/api/me");
        if (!mounted) {
          return;
        }
        setIsAuthorized(Boolean(me.role && allowedRoles.includes(me.role)));
      } catch {
        if (!mounted) {
          return;
        }
        setIsAuthorized(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // Loading state
  if (isAuthorized === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg-base)] p-6">
        <div className="dashboard-surface w-full max-w-sm p-8 text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-[var(--accent)]"></div>
          <p className="text-sm font-medium text-[var(--muted)]">Loading organization tree...</p>
        </div>
      </div>
    );
  }

  // Unauthorized - show message instead of redirecting
  if (!isAuthorized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg-base)] p-6">
        <div className="dashboard-surface w-full max-w-md p-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--ink)] mb-2">Access denied</h1>
          <p className="mb-4 text-sm leading-6 text-[var(--muted)]">You do not have permission to view the organization tree.</p>
          <a href="/dashboard" className="font-semibold text-[var(--accent)] hover:text-[var(--accent-hover)]">
            Return to Dashboard
          </a>
        </div>
      </div>
    );
  }

  return <OrgTree />;
}
