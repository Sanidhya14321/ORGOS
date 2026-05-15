import type { CardNavItem } from "@/components/ui/card-nav";
import { canAccessSection } from "@/lib/access";
import type { Role } from "@/lib/models";

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
      { label: "Import positions", href: "/dashboard/positions-import" },
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
      { label: "Knowledge base", href: "/dashboard/knowledge" },
      { label: "Forecasting", href: "/dashboard/forecast" },
      { label: "Settings", href: "/dashboard/settings" }
    ]
  }
];

/** Single source for dashboard card nav + RBAC filtering */
export function getCardNavItemsForRole(role?: Role): CardNavItem[] {
  const items = JSON.parse(JSON.stringify(BASE_CARD_NAV_ITEMS)) as CardNavItem[];
  if (!role) return [];

  items[0].links.unshift({ label: "Overview", href: `/dashboard/${role}` });

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
        if (link.href === "/dashboard/knowledge") return canAccessSection(role, "knowledge");
        if (link.href === "/dashboard/positions-import") return role === "ceo";
        if (link.href === "/dashboard/team") return canAccessSection(role, "team");
        if (link.href === "/dashboard/task-board") return canAccessSection(role, "taskBoard");
        return true;
      })
    }))
    .filter((group) => group.links.length > 0);
}
