import type { ReactNode } from "react";
import Link from "next/link";
import type { Role } from "@/lib/models";

type AppShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  layout?: "split" | "stack";
  role?: Role;
};

export function AppShell({ eyebrow, title, description, children, layout = "split", role }: AppShellProps) {
  const navLinks = role ? [
    { href: `/dashboard/${role}`, label: "Overview" },
    { href: "/dashboard/task-board", label: "Task board" },
    ...(role === "ceo" || role === "cfo" || role === "manager" ? [{ href: "/dashboard/org-tree", label: "Org tree" }] : []),
    ...(role === "ceo" ? [{ href: "/dashboard/ceo", label: "CEO control" }] : [])
  ] : [];

  if (layout === "stack") {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-[1440px] flex-col px-4 py-8 sm:px-6 lg:px-10">
        <section className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.26em] text-[var(--muted)] sm:text-sm sm:tracking-[0.32em]">{eyebrow}</p>
          <h1 className="mt-3 break-words font-serif text-3xl leading-tight text-[var(--ink)] sm:text-4xl lg:text-6xl">{title}</h1>
          <p className="mt-4 max-w-4xl break-words text-base leading-7 text-[var(--muted)]">{description}</p>
        </section>
        <section className="mt-6 min-w-0 rounded-[28px] border border-[var(--border)] bg-[var(--surface)]/85 p-6 shadow-[0_22px_70px_rgba(0,0,0,0.28)] backdrop-blur-xl">
          {children}
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col justify-center px-4 py-10 sm:px-6 lg:px-10 lg:py-12">
      {/* AppShell no longer renders a small nav; top-level Dashboard Topbar owns global navigation */}
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <section className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.26em] text-[var(--muted)] sm:text-sm sm:tracking-[0.32em]">{eyebrow}</p>
          <h1 className="mt-4 break-words font-serif text-3xl leading-tight text-[var(--ink)] sm:text-5xl lg:text-7xl">{title}</h1>
          <p className="mt-5 max-w-2xl break-words text-base leading-7 text-[var(--muted)] sm:text-lg sm:leading-8">{description}</p>
        </section>
        <section className="min-w-0 overflow-hidden rounded-[28px] border border-[var(--border)] bg-[var(--surface)]/90 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.3)] backdrop-blur-xl sm:p-6">
          {children}
        </section>
      </div>
    </main>
  );
}