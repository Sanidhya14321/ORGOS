"use client";

import type { ReactNode } from "react";
import type { Role } from "@/lib/models";
import { cn } from "@/lib/utils";

type AppShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  layout?: "split" | "stack"; // Logic preserved, but both now follow vertical flow
  role?: Role;
};

export function AppShell({ eyebrow, title, description, children, layout = "split", role }: AppShellProps) {
  // Logic for navLinks remains exactly the same for internal use/future-proofing
  const navLinks = role ? [
    { href: `/dashboard/${role}`, label: "Overview" },
    { href: "/dashboard/task-board", label: "Task board" },
    ...(role === "ceo" || role === "cfo" || role === "manager" ? [{ href: "/dashboard/org-tree", label: "Org tree" }] : []),
    ...(role === "ceo" ? [{ href: "/dashboard/ceo", label: "CEO control" }] : [])
  ] : [];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-12 lg:py-16">
      {/* 1. Header Section: High-Professional Typography Stacking */}
      <header className="mb-10 space-y-4 max-w-4xl animate-in fade-in slide-in-from-top-4 duration-700">
        <div className="space-y-1">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-text-secondary opacity-70">
            {eyebrow}
          </p>
          <h1 className="text-4xl font-bold tracking-tight text-text-primary sm:text-5xl lg:text-6xl">
            {title}
          </h1>
        </div>
        
        <p className="text-base leading-relaxed text-text-secondary md:text-lg opacity-80">
          {description}
        </p>

        {/* Subtle decorative line to separate context from execution */}
        <div className="h-px w-24 bg-accent/30 mt-8" />
      </header>

      {/* 2. Content Section: Full-Width Tactical Card */}
      <section 
        className={cn(
          "relative min-w-0 overflow-hidden rounded-[32px] border border-border bg-bg-surface/50 shadow-2xl backdrop-blur-2xl animate-in fade-in slide-in-from-bottom-6 duration-1000",
          layout === "stack" ? "p-6 lg:p-8" : "p-8 lg:p-10"
        )}
      >
        {/* Subtle inner ambient glow */}
        <div className="pointer-events-none absolute -left-20 -top-20 h-64 w-64 bg-accent/5 blur-[120px]" />
        
        <div className="relative z-10">
          {children}
        </div>
      </section>
    </main>
  );
}