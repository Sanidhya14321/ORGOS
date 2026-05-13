"use client";

import { type ReactNode, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { gsap } from "gsap";
import {
  ArrowRight,
  BarChart3,
  FolderKanban,
  Goal,
  Menu,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Target,
  Users,
  UserRound,
  X
} from "lucide-react";
import { cn } from "@/lib/utils";

const TOPBAR_HEIGHT = 56;
/** SSR / pre-layout fallback total nav height */
const NAV_EXPANDED_FALLBACK = 260;
const VIEWPORT_HEIGHT_CAP = 0.88;

export interface CardNavLink {
  label: string;
  href: string;
}

export interface CardNavItem {
  label: string;
  links: CardNavLink[];
}

export interface CardNavProps {
  items: CardNavItem[];
  pageTitle?: string;
  isAuthenticated?: boolean;
  actions?: ReactNode;
  className?: string;
}

function iconForLink(label: string) {
  if (label === "Task Board") return FolderKanban;
  if (label === "Projects") return FolderKanban;
  if (label === "Approvals") return UserRound;
  if (label === "Team Directory") return Users;
  if (label === "Org Tree") return Users;
  if (label === "Power Control") return SlidersHorizontal;
  if (label === "Recruitment") return UserRound;
  if (label === "Inbox") return Sparkles;
  if (label === "Analytics") return BarChart3;
  if (label === "Goals & OKRs") return Goal;
  if (label === "Forecasting") return Target;
  if (label === "Settings") return Settings;
  return ArrowRight;
}

export function CardNav({ items, pageTitle = "Dashboard", isAuthenticated = true, actions, className }: CardNavProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const navRef = useRef<HTMLElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<Array<HTMLDivElement | null>>([]);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);

  const ctaHref = isAuthenticated ? "/dashboard/capture" : "/login";

  const cardTints = useMemo(
    () => [
      "bg-accent-subtle/70 border-border/60",
      "bg-success-subtle/70 border-border/60",
      "bg-info-subtle/70 border-border/60"
    ],
    []
  );

  const getExpandedHeight = () => {
    if (typeof window === "undefined") return NAV_EXPANDED_FALLBACK;
    const contentHeight = contentRef.current?.scrollHeight ?? 0;
    const raw = TOPBAR_HEIGHT + contentHeight;
    if (contentHeight <= 0) return NAV_EXPANDED_FALLBACK;
    const cap = Math.floor(window.innerHeight * VIEWPORT_HEIGHT_CAP);
    return Math.min(raw, cap);
  };

  useLayoutEffect(() => {
    const nav = navRef.current;
    const contentEl = contentRef.current;
    if (!nav) return;

    const cards = cardRefs.current.filter((card): card is HTMLDivElement => card !== null);

    gsap.set(nav, { height: TOPBAR_HEIGHT });
    gsap.set(cards, { autoAlpha: 0, y: 50 });

    const timeline = gsap.timeline({ paused: true, defaults: { ease: "power3.inOut" } });

    timeline
      .to(nav, {
        height: () => getExpandedHeight(),
        duration: 0.52
      })
      .to(
        cards,
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.4,
          stagger: 0.08,
          ease: "power3.out"
        },
        0.12
      );

    timeline.reverse();
    timelineRef.current = timeline;

    const handleResize = () => {
      const current = timelineRef.current;
      if (!current) return;

      if (current.progress() > 0 && !current.reversed()) {
        gsap.set(nav, { height: getExpandedHeight() });
      } else {
        gsap.set(nav, { height: TOPBAR_HEIGHT });
      }
    };

    window.addEventListener("resize", handleResize);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && contentEl) {
      resizeObserver = new ResizeObserver(() => {
        const current = timelineRef.current;
        if (!current) return;
        if (current.progress() > 0 && !current.reversed()) {
          gsap.set(nav, { height: getExpandedHeight() });
        }
      });
      resizeObserver.observe(contentEl);
    }

    return () => {
      window.removeEventListener("resize", handleResize);
      resizeObserver?.disconnect();
      timeline.kill();
    };
  }, [items]);

  const toggleMenu = () => {
    const timeline = timelineRef.current;
    if (!timeline) return;

    if (timeline.reversed()) {
      timeline.play();
      setMenuOpen(true);
      return;
    }

    timeline.reverse();
    setMenuOpen(false);
  };

  return (
    <nav
      ref={navRef}
      className={cn(
        "sticky flex w-full flex-col overflow-hidden rounded-[28px] border border-border/60 bg-bg-surface/85 shadow-[0_24px_60px_rgba(23,21,19,0.10)] backdrop-blur-xl",
        className
      )}
      aria-label="Primary navigation"
    >
      <div className="relative flex h-14 shrink-0 items-center gap-2 px-3 md:px-5">
        <button
          type="button"
          onClick={toggleMenu}
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-bg-elevated/80 text-text-primary transition hover:bg-bg-subtle"
          aria-expanded={menuOpen}
          aria-controls="card-nav-content"
          aria-label={menuOpen ? "Collapse navigation menu" : "Expand navigation menu"}
        >
          {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>

        <Link
          href="/dashboard"
          className="absolute left-1/2 hidden -translate-x-1/2 flex-col items-center md:flex"
          aria-label="ORGOS dashboard home"
        >
          <span className="text-[10px] font-semibold uppercase tracking-[0.26em] text-text-secondary">ORGOS</span>
          <span className="-mt-0.5 text-sm font-semibold text-text-primary">{pageTitle}</span>
        </Link>

        <div className="ml-auto flex items-center gap-2">
          {actions}
          <Link
            href={ctaHref}
            className="inline-flex items-center gap-1.5 rounded-xl border border-transparent bg-accent px-3.5 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-white shadow-[0_16px_28px_rgba(var(--accent-rgb),0.22)] transition hover:-translate-y-0.5 hover:bg-accent-hover"
          >
            Command
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      <div
        id="card-nav-content"
        ref={contentRef}
        className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 md:px-5 md:pb-4"
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {items.map((item, index) => (
            <div
              key={item.label}
              ref={(element) => {
                cardRefs.current[index] = element;
              }}
              className={cn("rounded-[24px] border p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]", cardTints[index] ?? "bg-bg-subtle border-border/40")}
            >
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-text-secondary">{item.label}</p>
              <ul className="space-y-1.5">
                {item.links.map((link) => {
                  const Icon = iconForLink(link.label);
                  return (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="group flex items-center justify-between rounded-2xl border border-transparent px-3 py-2.5 text-sm font-medium text-text-primary transition hover:border-border/70 hover:bg-bg-surface/80"
                      >
                        <span className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-text-secondary transition group-hover:text-text-primary" />
                          {link.label}
                        </span>
                        <ArrowRight className="h-3.5 w-3.5 text-text-muted transition group-hover:translate-x-0.5 group-hover:text-text-secondary" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </nav>
  );
}