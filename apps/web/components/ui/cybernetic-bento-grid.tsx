"use client";

import { useState } from "react";
import { ArrowUpRight, Building2, ShieldCheck, Workflow } from "lucide-react";

type BentoItem = {
  title: string;
  description: string;
  icon: React.ReactNode;
  status: string;
  tags: string[];
  image?: string;
};

const items: BentoItem[] = [
  {
    title: "Org Graph Intelligence",
    description: "Map CEO to contributor reporting lines and instantly surface bottlenecks in team layers.",
    icon: <Building2 className="h-4 w-4 text-accent" />,
    status: "Live Topology",
    tags: ["Hierarchy", "Realtime", "Visibility"],
    image: "https://images.unsplash.com/photo-1557804506-669a67965ba0?auto=format&fit=crop&w=1200&q=80"
  },
  {
    title: "Decision Routing",
    description: "Automatically route escalations and approvals upward while delegating execution downward.",
    icon: <Workflow className="h-4 w-4 text-accent" />,
    status: "Flow Active",
    tags: ["Rules", "Delegation", "Approvals"],
    image: "https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=1200&q=80"
  },
  {
    title: "Executive Controls",
    description: "CEO and CFO checkpoints enforce strategic and financial governance with full audit trails.",
    icon: <ShieldCheck className="h-4 w-4 text-accent" />,
    status: "Policy Guarded",
    tags: ["Governance", "Audit", "Risk"],
    image: "https://images.unsplash.com/photo-1520607162513-77705c0f0d4a?auto=format&fit=crop&w=1200&q=80"
  }
];

export function CyberneticBentoGrid() {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  return (
    <div className="grid gap-4 md:grid-cols-12">
      {items.map((item, index) => {
        const isLarge = index === 0;
        const isHovered = hoveredIndex === index;

        return (
          <article
            key={item.title}
            className={[
              "group relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]",
              "p-4 transition-all duration-300",
              isLarge ? "md:col-span-7 md:row-span-2 min-h-[280px]" : "md:col-span-5 min-h-[132px]",
              isHovered ? "-translate-y-0.5 shadow-[0_16px_40px_rgba(0,0,0,0.3)]" : ""
            ].join(" ")}
            onMouseMove={() => setHoveredIndex(index)}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            {item.image ? (
              <div
                className="absolute inset-0 opacity-15 transition-opacity duration-300 group-hover:opacity-20"
                style={{ backgroundImage: `url(${item.image})`, backgroundSize: "cover", backgroundPosition: "center" }}
                aria-hidden
              />
            ) : null}

            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(var(--accent-rgb),0.18),transparent_55%)]" />

            <div className="relative z-10 flex h-full flex-col justify-between">
              <div>
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg-subtle)] px-2.5 py-1 text-xs text-[var(--text-secondary)]">
                  {item.icon}
                  {item.status}
                </div>
                <h3 className="text-lg font-semibold text-[var(--ink)]">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{item.description}</p>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  {item.tags.map((tag) => (
                    <span key={tag} className="rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1 text-[11px] text-[var(--text-secondary)]">
                      {tag}
                    </span>
                  ))}
                </div>
                <ArrowUpRight className="h-4 w-4 text-[var(--ink)] transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
