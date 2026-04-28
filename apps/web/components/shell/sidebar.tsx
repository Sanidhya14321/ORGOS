"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, CheckSquare, Network, Users, Target, BriefcaseBusiness, Settings, LogOut, Clock, Sparkles, Search } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { Role, User } from "@/lib/models";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type SidebarProps = {
  user?: User;
  isLoading: boolean;
};

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  show: (role: Role) => boolean;
};

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, show: () => true },
  { href: "/dashboard/task-board", label: "My Tasks", icon: CheckSquare, show: () => true },
  { href: "/dashboard/capture", label: "Smart Input", icon: Target, show: () => true },
  { href: "/dashboard/inbox", label: "Inbox", icon: BriefcaseBusiness, show: () => true },
  { href: "/dashboard/time", label: "Time", icon: Clock, show: () => true },
  { href: "/dashboard/forecast", label: "Forecast", icon: Target, show: (role) => role !== "worker" },
  { href: "/dashboard/analytics", label: "Analytics", icon: Network, show: (role) => role !== "worker" },
  { href: "/dashboard/assistant", label: "Assistant", icon: Sparkles, show: () => true },
  { href: "/dashboard/org-tree", label: "Org Tree", icon: Network, show: (role) => role !== "worker" },
  { href: "/dashboard/team", label: "Team", icon: Users, show: (role) => role === "manager" || role === "ceo" || role === "cfo" },
  { href: "/dashboard/goals", label: "Goals", icon: Target, show: (role) => role === "manager" || role === "ceo" || role === "cfo" },
  { href: "/dashboard/recruit", label: "Recruitment", icon: BriefcaseBusiness, show: (role) => role === "ceo" || role === "cfo" || role === "manager" },
  { href: "/dashboard/shortcuts", label: "Shortcuts", icon: Search, show: () => true },
  { href: "/dashboard/settings", label: "Settings", icon: Settings, show: (role) => role === "ceo" || role === "cfo" }
];

export function Sidebar({ user, isLoading }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();

  const logoutMutation = useMutation({
    mutationFn: () => apiFetch("/api/auth/logout", { method: "POST" }),
    onSuccess: () => {
      queryClient.clear();
      router.replace("/login");
    }
  });

  const role = user?.role ?? "worker";
  const filteredNav = navItems.filter((item) => item.show(role));

  return (
    <aside className="fixed left-0 top-0 z-30 hidden h-screen w-[220px] border-r border-border bg-bg-surface md:flex md:flex-col">
      <div className="border-b border-border px-4 py-5">
        <h1 className="text-lg font-semibold text-accent">ORGOS</h1>
        <p className="text-xs text-text-secondary">{user?.org_id ? `Org ${user.org_id.slice(0, 8)}` : "No org yet"}</p>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {isLoading ? (
          <>
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </>
        ) : (
          filteredNav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "focus-ring flex items-center gap-3 rounded-md border px-3 py-2 text-sm transition",
                  active
                    ? "border-accent bg-accent-subtle text-accent"
                    : "border-transparent text-text-secondary hover:border-border hover:bg-bg-elevated hover:text-text-primary"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })
        )}
      </nav>

      <div className="border-t border-border p-3">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Avatar className="h-9 w-9">
                <AvatarFallback>{(user?.full_name ?? "U").slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-text-primary">{user?.full_name}</p>
                <Badge className="bg-bg-subtle text-xs uppercase text-text-secondary">{user?.role}</Badge>
              </div>
            </div>
            <button
              type="button"
              className="focus-ring flex w-full items-center justify-center gap-2 rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm text-text-secondary hover:text-text-primary"
              onClick={() => logoutMutation.mutate()}
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
