"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { connectSocket, disconnectSocket, useSocket } from "@/lib/socket";
import { useOrgosStore } from "@/store";
import type { Goal, PendingMember, Report, Task, User } from "@/lib/models";

type DashboardSummary = {
  tasks: number;
  goals: number;
  reports: number;
  pendingMembers: number;
};

type FeedItem = {
  id: string;
  title: string;
  description: string;
  tone: "positive" | "warning" | "neutral";
};

function toneClass(tone: FeedItem["tone"]): string {
  switch (tone) {
    case "positive":
      return "bg-[#e6f5f1] text-[#166c60]";
    case "warning":
      return "bg-[#fff0e6] text-[#9f4f20]";
    default:
      return "bg-[#f1f5f9] text-[#475569]";
  }
}

export function CeoApprovalDashboard() {
  const socket = useSocket();
  const setUser = useOrgosStore((state) => state.setUser);
  const setTasks = useOrgosStore((state) => state.setTasks);
  const setGoals = useOrgosStore((state) => state.setGoals);
  const wsConnected = useOrgosStore((state) => state.wsConnected);

  const [pendingMembers, setPendingMembers] = useState<PendingMember[]>([]);
  const [summary, setSummary] = useState<DashboardSummary>({ tasks: 0, goals: 0, reports: 0, pendingMembers: 0 });
  const [recentReports, setRecentReports] = useState<Report[]>([]);
  const [recentGoals, setRecentGoals] = useState<Goal[]>([]);
  const [activity, setActivity] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  useEffect(() => {
    connectSocket();
    return () => disconnectSocket();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      setLoading(true);
      try {
        const [user, taskResponse, goalResponse, pendingResponse] = await Promise.all([
          apiFetch<User>("/api/me"),
          apiFetch<{ items: Task[] }>("/api/tasks?limit=20"),
          apiFetch<{ items: Goal[] }>("/api/goals?limit=12"),
          apiFetch<{ items: PendingMember[] }>("/api/orgs/pending-members")
        ]);

        const firstTask = taskResponse.items[0];
        const reportResponse = firstTask
          ? await apiFetch<{ items: Report[] }>(`/api/reports/${firstTask.id}`)
          : { items: [] as Report[] };

        if (cancelled) {
          return;
        }

        setUser(user);
        setTasks(taskResponse.items);
        setGoals(goalResponse.items);
        setPendingMembers(pendingResponse.items);
        setRecentReports(reportResponse.items);
        setRecentGoals(goalResponse.items.slice(0, 4));
        setSummary({
          tasks: taskResponse.items.length,
          goals: goalResponse.items.length,
          reports: reportResponse.items.length,
          pendingMembers: pendingResponse.items.length
        });
        setActivity([
          {
            id: "bootstrap",
            title: "CEO dashboard loaded",
            description: `${pendingResponse.items.length} onboarding requests ready for review.`,
            tone: pendingResponse.items.length > 0 ? "warning" : "positive"
          }
        ]);
      } catch (error) {
        if (!cancelled) {
          setActivity([
            {
              id: "bootstrap-error",
              title: "Dashboard bootstrap failed",
              description: error instanceof Error ? error.message : "Unable to load CEO dashboard",
              tone: "warning"
            }
          ]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, [setGoals, setTasks, setUser]);

  useEffect(() => {
    const onPendingMember = (payload: { memberId?: string; email?: string }) => {
      setActivity((items) => [
        {
          id: `member-${payload.memberId ?? Date.now()}`,
          title: "New member pending approval",
          description: payload.email ? `${payload.email} is waiting for review.` : "A member is waiting for CEO approval.",
          tone: "warning"
        },
        ...items
      ]);
    };

    const onTaskAssigned = (payload: { taskId: string }) => {
      setActivity((items) => [
        {
          id: `task-${payload.taskId}`,
          title: "Task assigned",
          description: `Task ${payload.taskId} entered execution flow.`,
          tone: "neutral"
        },
        ...items
      ]);
    };

    const onReportSubmitted = (payload: { taskId: string; reportId?: string }) => {
      setActivity((items) => [
        {
          id: `report-${payload.reportId ?? payload.taskId}`,
          title: "Report submitted",
          description: `Task ${payload.taskId} has a new report waiting for review.`,
          tone: "positive"
        },
        ...items
      ]);
    };

    socket.on("org:member_pending", onPendingMember);
    socket.on("task:assigned", onTaskAssigned);
    socket.on("task:report_submitted", onReportSubmitted);

    return () => {
      socket.off("org:member_pending", onPendingMember);
      socket.off("task:assigned", onTaskAssigned);
      socket.off("task:report_submitted", onReportSubmitted);
    };
  }, [socket]);

  async function decideMember(memberId: string, decision: "approve" | "reject") {
    try {
      setActionId(memberId);
      if (decision === "approve") {
        await apiFetch(`/api/orgs/members/${memberId}/approve`, { method: "POST" });
      } else {
        const reason = window.prompt("Reason for rejection (minimum 3 characters):", "Insufficient fit") ?? "";
        if (reason.trim().length < 3) {
          throw new Error("Rejection reason must be at least 3 characters.");
        }
        await apiFetch(`/api/orgs/members/${memberId}/reject`, {
          method: "POST",
          body: JSON.stringify({ reason })
        });
      }

      setPendingMembers((items) => items.filter((member) => member.id !== memberId));
      setSummary((current) => ({ ...current, pendingMembers: Math.max(0, current.pendingMembers - 1) }));
      setActivity((items) => [
        {
          id: `member-${decision}-${memberId}`,
          title: decision === "approve" ? "Member approved" : "Member rejected",
          description: `Decision recorded for ${memberId}.`,
          tone: decision === "approve" ? "positive" : "warning"
        },
        ...items
      ]);
    } catch (error) {
      setActivity((items) => [
        {
          id: `member-error-${memberId}`,
          title: "Approval action failed",
          description: error instanceof Error ? error.message : "Unable to process member decision",
          tone: "warning"
        },
        ...items
      ]);
    } finally {
      setActionId(null);
    }
  }

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-6 px-0 py-3 sm:px-2 lg:px-4">
      <section className="rounded-[2rem] border border-white/70 bg-white/80 p-6 shadow-[0_24px_80px_rgba(18,24,38,0.12)] backdrop-blur-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[#6b7280]">CEO approval dashboard</p>
            <h1 className="mt-3 break-words font-serif text-3xl leading-tight text-[#121826] sm:text-4xl lg:text-6xl">Review onboarding requests</h1>
            <p className="mt-4 max-w-2xl break-words text-base leading-7 text-[#4b5563]">
              Approve new members, monitor live execution, and keep the org moving without leaving the dashboard.
            </p>
            <div className="mt-5">
              <Link
                href="/dashboard/org-tree"
                className="inline-flex items-center rounded-2xl border border-[#ddd6c8] bg-white px-4 py-2.5 text-sm font-semibold text-[#121826] transition hover:bg-[#f8f5ef]"
              >
                Open org tree view
              </Link>
            </div>
          </div>
          <div className={`inline-flex items-center gap-2 self-start rounded-full px-4 py-2 text-sm font-semibold ${wsConnected ? "bg-[#e6f5f1] text-[#166c60]" : "bg-[#fff1e8] text-[#9f4f20]"}`}>
            <span className={`h-2.5 w-2.5 rounded-full ${wsConnected ? "bg-[#2a9d8f]" : "bg-[#ff6b35]"}`} />
            {wsConnected ? "Realtime connected" : "Connecting realtime"}
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Pending members", value: summary.pendingMembers },
            { label: "Goals", value: summary.goals },
            { label: "Tasks", value: summary.tasks },
            { label: "Reports", value: summary.reports }
          ].map((stat) => (
            <article key={stat.label} className="rounded-3xl border border-[#ece7dd] bg-[#fbfaf7] p-4">
              <p className="text-sm font-medium text-[#6b7280]">{stat.label}</p>
              <p className="mt-2 text-3xl font-semibold text-[#121826]">{stat.value}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.3fr_0.9fr]">
        <div className="rounded-[2rem] border border-white/70 bg-white/90 p-6 shadow-[0_24px_80px_rgba(18,24,38,0.1)]">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold text-[#121826]">Pending approvals</h2>
              <p className="mt-1 text-sm text-[#6b7280]">Review onboarding requests and assign access by organization needs.</p>
            </div>
            {loading ? <span className="text-sm text-[#6b7280]">Syncing...</span> : null}
          </div>

          <div className="mt-6 space-y-3">
            {pendingMembers.map((member) => (
              <article key={member.id} className="min-w-0 rounded-3xl border border-[#ece7dd] bg-[#faf8f4] p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <p className="text-lg font-semibold text-[#121826]">{member.full_name}</p>
                    <p className="break-all text-sm text-[#6b7280]">{member.email}</p>
                    <p className="mt-1 break-all text-xs uppercase tracking-[0.08em] text-[#8b8f97] sm:tracking-[0.2em]">
                      {member.position_id ? `Position ${member.position_id}` : "No position selected"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => decideMember(member.id, "approve")}
                      disabled={actionId === member.id}
                      className="rounded-2xl bg-[#2a9d8f] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#238477] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => decideMember(member.id, "reject")}
                      disabled={actionId === member.id}
                      className="rounded-2xl bg-[#ff6b35] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#e35b28] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </article>
            ))}

            {pendingMembers.length === 0 ? (
              <p className="rounded-3xl border border-dashed border-[#ddd6c8] bg-[#fbfaf7] px-4 py-6 text-sm text-[#6b7280]">
                No pending approvals at the moment.
              </p>
            ) : null}
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            <div className="rounded-3xl border border-[#ece7dd] bg-[#fbfaf7] p-4">
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#6b7280]">Recent goals</p>
              <div className="mt-3 space-y-3">
                {recentGoals.map((goal) => (
                  <article key={goal.id} className="rounded-2xl bg-white p-3 shadow-sm">
                    <p className="font-semibold text-[#121826]">{goal.title}</p>
                    <p className="mt-1 text-sm text-[#6b7280]">{goal.priority} · {goal.status}</p>
                  </article>
                ))}
                {recentGoals.length === 0 ? <p className="text-sm text-[#6b7280]">No goals loaded.</p> : null}
              </div>
            </div>

            <div className="rounded-3xl border border-[#ece7dd] bg-[#fbfaf7] p-4">
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#6b7280]">Recent reports</p>
              <div className="mt-3 space-y-3">
                {recentReports.map((report) => (
                  <article key={report.id} className="rounded-2xl bg-white p-3 shadow-sm">
                    <p className="font-semibold text-[#121826]">{report.status}</p>
                    <p className="mt-1 text-sm text-[#6b7280]">Confidence {report.confidence.toFixed(2)}</p>
                  </article>
                ))}
                {recentReports.length === 0 ? <p className="text-sm text-[#6b7280]">No reports loaded.</p> : null}
              </div>
            </div>
          </div>
        </div>

        <aside className="rounded-[2rem] border border-white/70 bg-white/90 p-6 shadow-[0_24px_80px_rgba(18,24,38,0.1)]">
          <h2 className="text-2xl font-semibold text-[#121826]">Approval activity</h2>
          <div className="mt-5 space-y-3">
            {activity.map((item) => (
              <article key={item.id} className="min-w-0 rounded-2xl border border-[#ece7dd] bg-[#fbfaf7] p-4">
                <div className="flex items-start gap-3">
                  <span className={`mt-1 inline-flex h-2.5 w-2.5 rounded-full ${toneClass(item.tone)}`} />
                  <div className="min-w-0">
                    <p className="font-semibold text-[#121826]">{item.title}</p>
                    <p className="mt-1 break-words text-sm leading-6 text-[#6b7280]">{item.description}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>

          <div className="mt-6 rounded-3xl bg-[#121826] p-5 text-white">
            <p className="text-sm uppercase tracking-[0.25em] text-white/60">Executive note</p>
            <p className="mt-3 text-sm leading-6 text-white/80">
              This dashboard is optimized for approvals first. Open the role dashboard if you need the broader activity feed.
            </p>
          </div>
        </aside>
      </section>
    </div>
  );
}