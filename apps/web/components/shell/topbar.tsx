"use client";

import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardNav, type CardNavItem } from "@/components/ui/card-nav";
import { NotificationsDrawer } from "@/components/shell/notifications-drawer";
import { CommandPalette } from "@/components/shell/command-palette";
import type { Goal, Task, User, PendingMember, Applicant, Role } from "@/lib/models";

const BASE_CARD_NAV_ITEMS: CardNavItem[] = [
  {
    label: "Operations",
    links: [
      { label: "Task Board", href: "/dashboard/task-board" },
      { label: "Projects", href: "/dashboard/projects" },
      { label: "Approvals", href: "/dashboard/approvals" },
      { label: "Focus Mode", href: "/dashboard/focus" }
    ]
  },
  {
    label: "People & Growth",
    links: [
      { label: "Team Directory", href: "/dashboard/team" },
      { label: "Org Tree", href: "/dashboard/org-tree" },
      { label: "Recruitment", href: "/dashboard/recruit" },
      { label: "Inbox", href: "/dashboard/inbox" }
    ]
  },
  {
    label: "Intelligence",
    links: [
      { label: "Analytics", href: "/dashboard/analytics" },
      { label: "Goals & OKRs", href: "/dashboard/goals" },
      { label: "Forecasting", href: "/dashboard/forecast" },
      { label: "Settings", href: "/dashboard/settings" }
    ]
  }
];

function getCardNavItemsForRole(role?: Role): CardNavItem[] {
  const items = JSON.parse(JSON.stringify(BASE_CARD_NAV_ITEMS)) as CardNavItem[];
  if (!role) return items;

  // Add role-specific Overview link at the front of Operations
  items[0].links.unshift({ label: "Overview", href: `/dashboard/${role}` });

  // Add Org Tree for manager-like roles (ensure no duplicate)
  if (role === "ceo" || role === "cfo" || role === "manager") {
    const peopleLinks = items[1].links.map((l) => l.href);
    if (!peopleLinks.includes("/dashboard/org-tree")) {
      items[1].links.splice(1, 0, { label: "Org Tree", href: "/dashboard/org-tree" });
    }
  }

  // CEO control link
  if (role === "ceo") {
    const opsLinks = items[0].links.map((l) => l.href);
    if (!opsLinks.includes("/dashboard/ceo")) {
      items[0].links.push({ label: "CEO control", href: "/dashboard/ceo" });
    }
  }

  return items;
}

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
  const items = getCardNavItemsForRole(role);

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

      <CommandPalette goals={goals} tasks={tasks} people={people} applicants={applicants} />
    </header>
  );
}
