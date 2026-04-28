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
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Unauthorized - show message instead of redirecting
  if (!isAuthorized) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
          <p className="text-gray-600 mb-4">You do not have permission to view the organization tree.</p>
          <a href="/dashboard" className="text-indigo-600 hover:text-indigo-700 font-medium">
            Return to Dashboard
          </a>
        </div>
      </div>
    );
  }

  return <OrgTree />;
}
