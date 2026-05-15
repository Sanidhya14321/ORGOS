"use client";

import { useMemo } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardNav } from "@/components/ui/card-nav";
import { NotificationsDrawer } from "@/components/shell/notifications-drawer";
import { CommandPalette } from "@/components/shell/command-palette";
import { getCardNavItemsForRole } from "@/lib/dashboard-nav";
import type { Goal, Task, User, PendingMember, Applicant, Role } from "@/lib/models";

export function Topbar({
  pageTitle,
  tasks,
  goals,
  people,
  applicants,
  pendingMembers,
  agentRunning,
  role
}: {
  pageTitle: string;
  tasks: Task[];
  goals: Goal[];
  people: User[];
  applicants: Applicant[];
  pendingMembers: PendingMember[];
  agentRunning: boolean;
  role?: Role;
}) {
  const items = useMemo(() => getCardNavItemsForRole(role), [role]);

  return (
    <header className="sticky top-4 z-30 flex justify-center px-3 md:px-6">
      <CardNav
        className="w-full max-w-[1120px]"
        items={items}
        pageTitle={pageTitle}
        isAuthenticated
        actions={
          <>
            <div className="hidden items-center gap-2 rounded-md border border-border bg-bg-elevated px-2 py-1 text-xs text-text-secondary lg:flex">
              <span className={`h-2 w-2 rounded-full ${agentRunning ? "bg-success agent-pulse" : "bg-text-muted"}`} />
              Agent {agentRunning ? "running" : "idle"}
            </div>

            <Button
              variant="outline"
              size="sm"
              className="hidden border-border bg-bg-elevated text-text-secondary md:inline-flex"
              aria-label="Open command palette"
              onClick={() => window.dispatchEvent(new Event("orgos:open-command-palette"))}
            >
              <Search className="mr-2 h-4 w-4" />
              Search
              <span className="ml-2 rounded bg-bg-subtle px-1.5 py-0.5 text-[11px]">⌘K</span>
            </Button>

            <NotificationsDrawer tasks={tasks} pendingMembers={pendingMembers} />
          </>
        }
      />

      <CommandPalette goals={goals} tasks={tasks} people={people} applicants={applicants} role={role} />
    </header>
  );
}
