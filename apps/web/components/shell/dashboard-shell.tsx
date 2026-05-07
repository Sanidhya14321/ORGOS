"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { useRealtimeQueryInvalidation, useSocket } from "@/lib/socket";
import { Topbar } from "@/components/shell/topbar";
import { Skeleton } from "@/components/ui/skeleton";
import { useGoalsQuery, useMeQuery, useOrgAccountsQuery, usePendingMembersQuery, useTasksQuery } from "@/lib/queries";
import type { Applicant } from "@/lib/models";

function titleFromPath(pathname: string): string {
  if (pathname.startsWith("/dashboard/task-board")) return "My Tasks";
  if (pathname.startsWith("/dashboard/capture")) return "Smart Input";
  if (pathname.startsWith("/dashboard/inbox")) return "Inbox";
  if (pathname.startsWith("/dashboard/time")) return "Time";
  if (pathname.startsWith("/dashboard/forecast")) return "Forecast";
  if (pathname.startsWith("/dashboard/analytics")) return "Analytics";
  if (pathname.startsWith("/dashboard/assistant")) return "Assistant";
  if (pathname.startsWith("/dashboard/org-tree")) return "Org Tree";
  if (pathname.startsWith("/dashboard/goals")) return "Goals";
  if (pathname.startsWith("/dashboard/recruit")) return "Recruitment";
  if (pathname.startsWith("/dashboard/approvals")) return "Approvals";
  if (pathname.startsWith("/dashboard/shortcuts")) return "Shortcuts";
  return "Dashboard";
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/dashboard";
  const socket = useSocket();
  useRealtimeQueryInvalidation(true);
  const pageTitle = titleFromPath(pathname);

  const meQuery = useMeQuery();
  const tasksQuery = useTasksQuery();
  const goalsQuery = useGoalsQuery(meQuery.data?.role !== "worker");
  const pendingQuery = usePendingMembersQuery(meQuery.data?.role);
  const peopleQuery = useOrgAccountsQuery(meQuery.data?.org_id ?? undefined, meQuery.data?.role);

  const applicants: Applicant[] = useMemo(() => [], []);

  const isLoading = meQuery.isLoading;

  return (
    <div className="min-h-screen bg-bg-base">
      <Topbar
        pageTitle={pageTitle}
        tasks={tasksQuery.data ?? []}
        goals={goalsQuery.data ?? []}
        people={peopleQuery.data ?? []}
        applicants={applicants}
        pendingMembers={pendingQuery.data ?? []}
        agentRunning={socket.connected}
        role={meQuery.data?.role}
      />
      <main className="mx-auto w-full max-w-[1400px] px-4 pb-10 pt-6 md:pr-6">
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          children
        )}
      </main>
    </div>
  );
}
