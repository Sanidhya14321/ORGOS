"use client";

import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardNav, type CardNavItem } from "@/components/ui/card-nav";
import { NotificationsDrawer } from "@/components/shell/notifications-drawer";
import { CommandPalette } from "@/components/shell/command-palette";
import { canAccessSection } from "@/lib/access";
import type { Goal, Task, User, PendingMember, Applicant, Role } from "@/lib/models";

const BASE_CARD_NAV_ITEMS: CardNavItem[] = [
  {
    label: "Operations",
    links: [
      { label: "Task Board", href: "/dashboard/task-board" },
      { label: "Projects", href: "/dashboard/projects" }
    ]
  },
  {
    label: "People & Growth",
    links: [
      { label: "Collaboration Hub", href: "/dashboard/team" },
      { label: "Org Tree", href: "/dashboard/org-tree" },
      { label: "Power Control", href: "/dashboard/power" },
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
  if (!role) return [];

  // Add role-specific Overview link at the front of Operations
  items[0].links.unshift({ label: "Overview", href: `/dashboard/${role}` });

  // CEO control link
  if (role === "ceo") {
    const opsLinks = items[0].links.map((l) => l.href);
    if (!opsLinks.includes("/dashboard/ceo")) {
      items[0].links.push({ label: "CEO control", href: "/dashboard/ceo" });
    }
  }

  return items
    .map((group) => ({
      ...group,
      links: group.links.filter((link) => {
        if (link.href === "/dashboard/recruit") return canAccessSection(role, "recruitment");
        if (link.href === "/dashboard/forecast") return canAccessSection(role, "forecast");
        if (link.href === "/dashboard/analytics") return canAccessSection(role, "analytics");
        if (link.href === "/dashboard/settings") return canAccessSection(role, "orgSettings");
        if (link.href === "/dashboard/org-tree") return canAccessSection(role, "orgTree");
        if (link.href === "/dashboard/power") return canAccessSection(role, "powerControl");
        if (link.href === "/dashboard/goals") return canAccessSection(role, "goals");
        if (link.href === "/dashboard/team") return canAccessSection(role, "team");
        if (link.href === "/dashboard/task-board") return canAccessSection(role, "taskBoard");
        return true;
      })
    }))
    .filter((group) => group.links.length > 0);
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

      <CommandPalette goals={goals} tasks={tasks} people={people} applicants={applicants} role={role} />
    </header>
  );
}
