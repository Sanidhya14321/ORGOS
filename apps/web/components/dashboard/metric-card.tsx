"use client";

import React, { useRef, useCallback, useState, useEffect } from "react";
import { TrendingDown, TrendingUp, Activity, Target, Zap, AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { cn } from "@/lib/utils";

/* --- Utility: Mathematical Easing & Shadow Builder --- */
const parseHSL = (hslStr: string) => {
  const match = hslStr.match(/([\d.]+)\s*([\d.]+)%?\s*([\d.]+)%?/);
  return match ? { h: parseFloat(match[1]), s: parseFloat(match[2]), l: parseFloat(match[3]) } : { h: 220, s: 70, l: 50 };
};

const buildBoxShadow = (glowColor: string, intensity: number): string => {
  const { h, s, l } = parseHSL(glowColor);
  const base = `${h}deg ${s}% ${l}%`;
  const layers: [number, number, number, number, number, boolean][] = [
    [0, 0, 0, 1, 100, true], [0, 0, 15, 0, 30, true], [0, 0, 50, 2, 10, true],
    [0, 0, 1, 0, 60, false], [0, 0, 15, 0, 30, false], [0, 0, 50, 2, 10, false],
  ];
  return layers.map(([x, y, blur, spread, alpha, inset]) => {
    const a = Math.min(alpha * intensity, 100);
    return `${inset ? 'inset ' : ''}${x}px ${y}px ${blur}px ${spread}px hsl(${base} / ${a}%)`;
  }).join(', ');
};

const GRADIENT_POSITIONS = ['80% 55%', '69% 34%', '8% 6%', '41% 38%', '86% 85%', '82% 18%', '51% 4%'];
const COLOR_MAP = [0, 1, 2, 0, 1, 2, 1];

const buildMeshGradients = (colors: string[]): string[] => {
  const gradients: string[] = [];
  for (let i = 0; i < 7; i++) {
    const c = colors[Math.min(COLOR_MAP[i], colors.length - 1)];
    gradients.push(`radial-gradient(at ${GRADIENT_POSITIONS[i]}, ${c} 0px, transparent 50%)`);
  }
  gradients.push(`linear-gradient(${colors[0]} 0 100%)`);
  return gradients;
};

/* --- Main Component --- */
export function MetricCard({
  label,
  value,
  trend,
  loading,
  tone = "info"
}: {
  label: string;
  value: number;
  trend?: number;
  loading?: boolean;
  tone?: "info" | "success" | "warning" | "danger";
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [cursorAngle, setCursorAngle] = useState(45);
  const [edgeProximity, setEdgeProximity] = useState(0);

  // Tone-specific configuration
  const toneConfig = {
    info: { color: "217 91% 60%", mesh: ["#3b82f6", "#1e40af", "#60a5fa"], icon: <Activity className="h-4 w-4" /> },
    success: { color: "142 71% 45%", mesh: ["#22c55e", "#166534", "#4ade80"], icon: <Target className="h-4 w-4" /> },
    warning: { color: "38 92% 50%", mesh: ["#f59e0b", "#92400e", "#fbbf24"], icon: <Zap className="h-4 w-4" /> },
    danger: { color: "0 84% 60%", mesh: ["#ef4444", "#991b1b", "#f87171"], icon: <AlertCircle className="h-4 w-4" /> },
  }[tone];

  // Proximity Logic
  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    
    // Proximity
    const dx = x - cx;
    const dy = y - cy;
    const kx = cx / Math.abs(dx || 1);
    const ky = cy / Math.abs(dy || 1);
    setEdgeProximity(Math.min(Math.max(1 / Math.min(kx, ky), 0), 1));
    
    // Angle
    const radians = Math.atan2(dy, dx);
    let degrees = radians * (180 / Math.PI) + 90;
    setCursorAngle(degrees < 0 ? degrees + 360 : degrees);
  }, []);

  if (loading) {
    return (
      <div className="h-32 w-full rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-6 space-y-4 shadow-sm">
        <Skeleton className="h-4 w-20 bg-[var(--bg-subtle)]" />
        <Skeleton className="h-10 w-32 bg-[var(--bg-subtle)]" />
      </div>
    );
  }

  const isVisible = isHovered;
  const borderOpacity = isVisible ? Math.max(0, (edgeProximity * 100 - 50) / 50) : 0;
  const glowOpacity = isVisible ? Math.max(0, (edgeProximity * 100 - 30) / 70) : 0;
  const meshGradients = buildMeshGradients(toneConfig.mesh);
  const angleDeg = `${cursorAngle.toFixed(2)}deg`;

  return (
    <div
      ref={cardRef}
      onPointerMove={handlePointerMove}
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={() => setIsHovered(false)}
      className="relative isolate overflow-hidden rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-6 transition-all duration-500 group"
      style={{
        boxShadow: "0 20px 40px -22px rgba(15, 17, 21, 0.22)",
      }}
    >
      {/* 1. Reactive Border (Mesh Gradient) */}
      <div
        className="absolute inset-0 rounded-[inherit] -z-[1] pointer-events-none"
        style={{
          border: '1px solid transparent',
          background: [
            `linear-gradient(var(--surface), var(--surface)) padding-box`,
            ...meshGradients.map(g => `${g} border-box`),
          ].join(', '),
          opacity: borderOpacity,
          maskImage: `conic-gradient(from ${angleDeg} at center, black 25%, transparent 40%, transparent 60%, black 75%)`,
          WebkitMaskImage: `conic-gradient(from ${angleDeg} at center, black 25%, transparent 40%, transparent 60%, black 75%)`,
          transition: 'opacity 0.3s ease-out',
        }}
      />

      {/* 2. Reactive Outer Glow */}
      <span
        className="absolute pointer-events-none z-[1] rounded-[inherit]"
        style={{
          inset: "-40px",
          maskImage: `conic-gradient(from ${angleDeg} at center, black 2%, transparent 15%, transparent 85%, black 98%)`,
          WebkitMaskImage: `conic-gradient(from ${angleDeg} at center, black 2%, transparent 15%, transparent 85%, black 98%)`,
          opacity: glowOpacity * 0.8,
          mixBlendMode: 'plus-lighter',
          transition: 'opacity 0.4s ease-out',
        } as React.CSSProperties}
      >
        <span
          className="absolute rounded-[inherit]"
          style={{
            inset: "40px",
            boxShadow: buildBoxShadow(toneConfig.color, 1.2),
          }}
        />
      </span>

      {/* 3. Static Content Layer */}
      <div className="relative z-[2] space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[var(--muted)] leading-none">
            {label}
          </p>
          <div className={cn("rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] p-1.5", isHovered ? "text-[var(--accent)]" : "text-[var(--muted)] transition-colors") }>
            {toneConfig.icon}
          </div>
        </div>

        <div className="space-y-1">
          <h3 className="text-4xl font-bold tracking-tighter text-[var(--ink)]">
            <AnimatedNumber value={value} />
          </h3>

          {typeof trend === "number" ? (
            <div className={cn(
              "flex items-center gap-1 text-[11px] font-bold uppercase tracking-tight",
              trend >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]"
            )}>
              {trend >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              <span>{Math.abs(trend)}%</span>
              <span className="ml-1 font-medium text-[var(--muted)]">vs Prev Cycle</span>
            </div>
          ) : (
            <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">Baseline Established</p>
          )}
        </div>
      </div>
    </div>
  );
}