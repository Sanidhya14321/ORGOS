"use client";

import { Activity, ArrowUpRight, BarChart3, BriefcaseBusiness, CheckCircle2, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const records = [
  {
    employee: "Aarav Mehta",
    role: "Manager",
    goal: "Launch KPI dashboard",
    status: "Approved"
  },
  {
    employee: "Sana Iqbal",
    role: "Worker",
    goal: "Weekly report submission",
    status: "In Review"
  },
  {
    employee: "Rohan Das",
    role: "CFO",
    goal: "Budget variance analysis",
    status: "Approved"
  }
];

export function CustomersTableCard() {
  return (
    <Card className="rounded-2xl border-[var(--border)] bg-[#0f1115] text-[var(--ink)] shadow-none">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Realtime Org Pulse</CardTitle>
        <CardDescription className="text-[var(--muted)]">
          Live execution activity across roles in your ORGOS command center.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-xl border border-[var(--border)]">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--surface-2)] text-[var(--muted)]">
              <tr>
                <th className="px-3 py-2 font-medium">Employee</th>
                <th className="px-3 py-2 font-medium">Role</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {records.map((entry) => (
                <tr key={entry.employee} className="border-t border-[var(--border)] bg-[var(--surface)]">
                  <td className="px-3 py-2">{entry.employee}</td>
                  <td className="px-3 py-2 text-[var(--muted)]">{entry.role}</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#1f2a1f] px-2 py-0.5 text-xs text-[#9de7b8]">
                      <CheckCircle2 className="h-3 w-3" />
                      {entry.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

export default function OrgosFeatures() {
  return (
    <section className="grid gap-4 md:grid-cols-3">
      <Card className="rounded-2xl border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] shadow-none">
        <CardHeader>
          <div className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#1b222d] text-[#ff6b35]">
            <BriefcaseBusiness className="h-4 w-4" />
          </div>
          <CardTitle className="text-lg">Role-Driven Workflows</CardTitle>
          <CardDescription className="text-[var(--muted)]">Tasks are automatically routed by position level and reporting structure.</CardDescription>
        </CardHeader>
      </Card>

      <Card className="rounded-2xl border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] shadow-none">
        <CardHeader>
          <div className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#1b222d] text-[#ff6b35]">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <CardTitle className="text-lg">Executive Guardrails</CardTitle>
          <CardDescription className="text-[var(--muted)]">Critical approvals can only move through authorized CFO and CEO checkpoints.</CardDescription>
        </CardHeader>
      </Card>

      <Card className="rounded-2xl border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] shadow-none">
        <CardHeader>
          <div className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#1b222d] text-[#ff6b35]">
            <BarChart3 className="h-4 w-4" />
          </div>
          <CardTitle className="text-lg">Measurable Outcomes</CardTitle>
          <CardDescription className="text-[var(--muted)]">Track cycle velocity, report confidence, and accountability in one dashboard.</CardDescription>
        </CardHeader>
      </Card>

      <Card className="rounded-2xl border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] shadow-none md:col-span-2">
        <CardHeader>
          <CardTitle className="text-lg">Live Execution Feed</CardTitle>
          <CardDescription className="text-[var(--muted)]">Sample event stream from ORGOS runtime.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--muted)]">
            <span className="mr-2 inline-flex items-center gap-1 text-[#9de7b8]"><Activity className="h-3.5 w-3.5" />Live</span>
            Manager approved task bundle for Product Ops.
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--muted)]">
            CFO checkpoint validated budget envelope for Q4 sprint.
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] shadow-none">
        <CardHeader>
          <CardTitle className="text-lg">Explore ORGOS</CardTitle>
          <CardDescription className="text-[var(--muted)]">Inspect structure, goals, and reports in realtime.</CardDescription>
        </CardHeader>
        <CardContent>
          <button className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--ink)]">
            Open demo environment
            <ArrowUpRight className="h-4 w-4" />
          </button>
        </CardContent>
      </Card>
    </section>
  );
}
