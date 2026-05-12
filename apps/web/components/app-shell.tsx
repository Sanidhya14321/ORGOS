"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import type { Role } from "@/lib/models";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

type AppShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  layout?: "split" | "stack"; // Logic preserved, but both now follow vertical flow
  role?: Role;
};

export function AppShell({ eyebrow, title, description, children, layout = "split", role }: AppShellProps) {
  const navLinks = role ? [
    { href: `/dashboard/${role}`, label: "Overview" },
    { href: "/dashboard/task-board", label: "Task board" },
    ...(role === "ceo" || role === "cfo" || role === "manager" ? [{ href: "/dashboard/org-tree", label: "Org tree" }] : []),
    ...(role === "ceo" ? [{ href: "/dashboard/ceo", label: "CEO control" }] : [])
  ] : [];

  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-12 lg:py-16">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-[radial-gradient(circle_at_top_left,rgba(var(--accent-rgb),0.10),transparent_42%)]" />

      <header className="mb-10 animate-in fade-in slide-in-from-top-4 duration-700">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="max-w-4xl space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-border bg-bg-elevated text-text-secondary">
                {eyebrow}
              </Badge>
              <Badge variant="secondary">Operational workspace</Badge>
            </div>
            <div className="space-y-3">
              <h1 className="text-4xl font-bold tracking-tight text-text-primary sm:text-5xl lg:text-6xl">
                {title}
              </h1>
              <p className="text-base leading-relaxed text-text-secondary md:text-lg">
                {description}
              </p>
            </div>
          </div>

          <div className="rounded-[24px] border border-border bg-bg-surface/80 px-5 py-4 shadow-[0_20px_50px_rgba(23,21,19,0.08)] backdrop-blur-xl lg:min-w-[250px]">
            <p className="dashboard-label">Mode</p>
            <p className="mt-2 text-base font-semibold text-text-primary">Focused execution</p>
            <p className="mt-2 text-sm leading-6 text-text-secondary">
              Streamlined controls with space for denser operational detail.
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-full border border-border bg-bg-surface px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-text-secondary transition hover:border-border-strong hover:bg-bg-elevated hover:text-text-primary"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </header>

      <section
        className={cn(
          "dashboard-surface animate-in fade-in slide-in-from-bottom-6 duration-1000",
          layout === "stack" ? "p-6 lg:p-8" : "p-8 lg:p-10"
        )}
      >
        <div className="dashboard-panel">
          {children}
        </div>
      </section>
    </main>
  );
}