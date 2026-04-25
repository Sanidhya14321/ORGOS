"use client";

import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotificationsDrawer } from "@/components/shell/notifications-drawer";
import { CommandPalette } from "@/components/shell/command-palette";
import type { Goal, Task, User, PendingMember, Applicant } from "@/lib/models";

export function Topbar({
  pageTitle,
  tasks,
  goals,
  people,
  applicants,
  pendingMembers,
  agentRunning
}: {
  pageTitle: string;
  tasks: Task[];
  goals: Goal[];
  people: User[];
  applicants: Applicant[];
  pendingMembers: PendingMember[];
  agentRunning: boolean;
}) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-bg-surface/90 px-4 backdrop-blur md:pl-[244px]">
      <h1 className="text-lg font-semibold text-text-primary">{pageTitle}</h1>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 rounded-md border border-border bg-bg-elevated px-2 py-1 text-xs text-text-secondary">
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
      </div>

      <CommandPalette goals={goals} tasks={tasks} people={people} applicants={applicants} />
    </header>
  );
}
