"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Sparkles, RefreshCw } from "lucide-react";

type LoadingScreenProps = {
  compact?: boolean;
  message?: string;
};

/**
 * LoadingScreen: High-professional orchestration state.
 * Refactored to match the Strategic Command Center aesthetic.
 */
export function LoadingScreen({ compact = false, message = "Synchronizing Nodes" }: LoadingScreenProps) {
  return (
    <div 
      className={cn(
        "flex items-center justify-center animate-in fade-in duration-700",
        !compact && "min-h-[400px] w-full"
      )}
    >
      <div 
        className={cn(
          "relative overflow-hidden rounded-[32px] border border-border bg-bg-surface/50 p-10 text-center shadow-2xl backdrop-blur-2xl transition-all",
          compact ? "max-w-[320px]" : "max-w-[420px] w-full"
        )}
      >
        {/* Ambient background glow to simulate volumetric depth */}
        <div className="pointer-events-none absolute -left-12 -top-12 h-32 w-32 bg-accent/10 blur-[80px]" />
        <div className="pointer-events-none absolute -right-12 -bottom-12 h-32 w-32 bg-accent/5 blur-[80px]" />

        <div className="relative z-10 space-y-8">
          {/* Brand Identity */}
          <div className="space-y-2">
            <p className={cn(
              "font-bold tracking-[0.4em] text-text-primary leading-none",
              compact ? "text-xl" : "text-3xl"
            )}>
              ORGOS
            </p>
            <div className="h-px w-12 bg-accent/40 mx-auto rounded-full" />
          </div>

          {/* Indeterminate Orchestration Bar */}
          <div className="space-y-4">
            <div className="relative h-[2px] w-full overflow-hidden rounded-full bg-bg-subtle">
              {/* Indeterminate pulse animation */}
              <div className="absolute inset-0 h-full w-1/3 bg-gradient-to-r from-transparent via-accent to-transparent animate-[loadingPulse_1.5s_infinite_ease-in-out]" />
            </div>
            
            <div className="flex items-center justify-center gap-3">
              <RefreshCw className="h-3 w-3 animate-spin text-accent/60" />
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-text-secondary opacity-60">
                {message}
              </p>
            </div>
          </div>
        </div>

        {/* Global Metadata (Footer) */}
        <div className="mt-10 flex items-center justify-center gap-2 border-t border-border/50 pt-6">
          <Sparkles className="h-3 w-3 text-accent/40" />
          <p className="text-[9px] font-bold uppercase tracking-widest text-text-secondary opacity-40">
            Agentic AI Framework v2.4
          </p>
        </div>
      </div>

      {/* Global CSS for the indeterminate pulse animation */}
      <style jsx global>{`
        @keyframes loadingPulse {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(300%); }
        }
      `}</style>
    </div>
  );
}