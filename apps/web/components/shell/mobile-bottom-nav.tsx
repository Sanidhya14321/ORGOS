"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, CheckSquare, Target, BriefcaseBusiness, Network } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/dashboard/task-board", label: "Tasks", icon: CheckSquare },
  { href: "/dashboard/goals", label: "Goals", icon: Target },
  { href: "/dashboard/recruit", label: "Recruit", icon: BriefcaseBusiness },
  { href: "/dashboard/org-tree", label: "Tree", icon: Network }
] as const;

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg-surface/95 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 backdrop-blur md:hidden" aria-label="Mobile navigation">
      <ul className="grid grid-cols-5 gap-1">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "focus-ring flex flex-col items-center justify-center gap-1 rounded-md px-1 py-2 text-[11px]",
                  active ? "bg-accent-subtle text-accent" : "text-text-secondary"
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
