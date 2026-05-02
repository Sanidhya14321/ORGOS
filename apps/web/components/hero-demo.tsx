"use client";

import { useMemo, useState } from "react";

export function HeroDemo() {
  const [employees, setEmployees] = useState(42);
  const [simulateTick, setSimulateTick] = useState(0);

  const simulation = useMemo(() => {
    const managers = Math.max(1, Math.round(employees * 0.14));
    const workers = Math.max(1, Math.round(employees * 0.68));
    const executives = Math.max(2, employees - managers - workers);
    const tasks = Math.max(4, Math.round(workers * 1.6));
    const reports = Math.max(2, Math.round(tasks * 0.34));

    return {
      managers,
      workers,
      executives,
      tasks,
      reports
    };
  }, [employees, simulateTick]);

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[#0f1115] p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">Live ORGOS Demo</p>
        <button
          type="button"
          onClick={() => setSimulateTick((value) => value + 1)}
          className="rounded-xl bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[#0f1115] transition-all duration-200 hover:scale-[1.02]"
        >
          Simulate
        </button>
      </div>

      <div className="mt-4">
        <label className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Organization size</span>
          <input
            type="range"
            min={10}
            max={300}
            value={employees}
            onChange={(event) => setEmployees(Number(event.target.value))}
            className="w-full accent-[var(--accent)]"
          />
          <p className="text-sm text-[var(--ink)]">{employees} members</p>
        </label>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">Execs</p>
          <p className="mt-1 text-lg font-semibold text-[var(--ink)]">{simulation.executives}</p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">Managers</p>
          <p className="mt-1 text-lg font-semibold text-[var(--ink)]">{simulation.managers}</p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">Workers</p>
          <p className="mt-1 text-lg font-semibold text-[var(--ink)]">{simulation.workers}</p>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--muted)]">
        Projected execution cycle: <span className="font-semibold text-[var(--ink)]">{simulation.tasks} active tasks</span> {"->"} <span className="font-semibold text-[var(--ink)]">{simulation.reports} report checkpoints</span>
      </div>
    </div>
  );
}
