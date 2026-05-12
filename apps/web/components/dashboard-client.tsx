"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { connectSocket, disconnectSocket, useSocket } from "@/lib/socket";
import { useOrgosStore } from "@/store";
import type { Goal, PendingMember, Report, Role, Task, User } from "@/lib/models";

type ActivityItem = {
  id: string;
  label: string;
  detail: string;
  tone: "neutral" | "positive" | "warning";
};

type DashboardClientProps = {
  role: Role;
};

function mapReportTone(report: Report): ActivityItem["tone"] {
  if (report.escalate) {
    return "warning";
  }
  return report.confidence >= 0.8 ? "positive" : "neutral";
}

function roleTitle(role: Role): string {
  switch (role) {
    case "ceo":
      return "Executive Command";
    case "cfo":
      return "Finance Command";
    case "manager":
      return "Manager Control";
    default:
      return "Worker Console";
  }
}

function roleDescription(role: Role): string {
  switch (role) {
    case "ceo":
      return "Track decomposition, review strategic reports, and monitor escalation pressure.";
    case "cfo":
      return "Review financial priorities, live task flow, and synthesis summaries.";
    case "manager":
      return "Coordinate assigned work, watch execution signals, and handle escalations.";
    default:
      return "Execute your assigned tasks and submit reports as work moves forward.";
  }
}

function statusTone(status?: string | null): string {
  if (status === "completed" || status === "active" || status === "approved") {
    return "border border-success/20 bg-success-subtle text-success";
  }
  if (status === "blocked" || status === "rejected" || status === "cancelled") {
    return "border border-danger/20 bg-danger-subtle text-danger";
  }
  if (status === "pending" || status === "routing" || status === "in_progress") {
    return "border border-warning/20 bg-warning-subtle text-warning";
  }
  return "border border-border bg-bg-elevated text-text-secondary";
}

function activityDotTone(tone: ActivityItem["tone"]): string {
  if (tone === "positive") {
    return "bg-success";
  }
  if (tone === "warning") {
    return "bg-warning";
  }
  return "bg-info";
}

export function DashboardClient({ role }: DashboardClientProps) {
  const router = useRouter();
  const socket = useSocket();
  const currentUser = useOrgosStore((state) => state.currentUser);
  const setUser = useOrgosStore((state) => state.setUser);
  const setTasks = useOrgosStore((state) => state.setTasks);
  const setGoals = useOrgosStore((state) => state.setGoals);
  const wsConnected = useOrgosStore((state) => state.wsConnected);
  const myTasks = useOrgosStore((state) => state.myTasks);

  const [reports, setReports] = useState<Report[]>([]);
  const [pendingMembers, setPendingMembers] = useState<PendingMember[]>([]);
  const [memberActionId, setMemberActionId] = useState<string | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  const dashboardTitle = useMemo(() => roleTitle(role), [role]);

  useEffect(() => {
    connectSocket();
    return () => disconnectSocket();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      setLoading(true);
      try {
        const user = await apiFetch<User>("/api/me");
        if (user.status === "pending") {
          if (!cancelled) {
            setUser(user);
            setActivity([
              {
                id: "pending-onboarding",
                label: "Approval pending",
                detail: "Your profile is awaiting CEO/CFO approval. Redirecting to onboarding status.",
                tone: "warning"
              }
            ]);
            router.replace("/pending");
          }
          return;
        }

        if (!user.org_id) {
          if (!cancelled) {
            setUser(user);
            setActivity([
              {
                id: "org-link-required",
                label: "Organization setup required",
                detail: "Your account is not linked to an organization yet. Ask your administrator to provision access.",
                tone: "warning"
              }
            ]);
            router.replace("/pending");
          }
          return;
        }

        const taskResponse = await apiFetch<{ items: Task[] }>("/api/tasks?limit=20");
        const goalResponse = role === "ceo" || role === "cfo"
          ? await apiFetch<{ items: Goal[] }>("/api/goals?limit=12")
          : { items: [] as Goal[] };
        const pendingMemberResponse = role === "ceo" || role === "cfo"
          ? await apiFetch<{ items: PendingMember[] }>("/api/orgs/pending-members")
          : { items: [] as PendingMember[] };

        const reportResponse = taskResponse.items.length > 0
          ? await apiFetch<{ items: Report[] }>(`/api/reports/${taskResponse.items[0].id}`)
          : { items: [] as Report[] };

        if (cancelled) {
          return;
        }

        setUser(user);
        setTasks(taskResponse.items);
        setGoals(goalResponse.items);
        setPendingMembers(pendingMemberResponse.items);
        setReports(reportResponse.items);
        setActivity([
          {
            id: "bootstrap",
            label: "Dashboard loaded",
            detail: `${taskResponse.items.length} tasks and ${goalResponse.items.length} goals ready`,
            tone: "positive"
          }
        ]);
      } catch (error) {
        if (!cancelled) {
          setActivity([
            {
              id: "error",
              label: "Bootstrap failed",
              detail: error instanceof Error ? error.message : "Unable to load dashboard",
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
  }, [role, router, setGoals, setTasks, setUser]);

  useEffect(() => {
    const onTaskAssigned = (payload: { taskId: string; role?: Role }) => {
      setActivity((items) => [
        {
          id: `assigned-${payload.taskId}`,
          label: "Task assigned",
          detail: `Task ${payload.taskId} routed to ${payload.role ?? role}`,
          tone: "neutral"
        },
        ...items
      ]);
    };

    const onGoalDecomposed = (payload: { goalId: string; taskCount?: number }) => {
      setActivity((items) => [
        {
          id: `goal-${payload.goalId}`,
          label: "Goal decomposed",
          detail: `${payload.taskCount ?? 0} tasks created for goal ${payload.goalId}`,
          tone: "positive"
        },
        ...items
      ]);
    };

    const onReport = (payload: { taskId: string; reportId: string; confidence?: number; escalate?: boolean }) => {
      setActivity((items) => [
        {
          id: `report-${payload.reportId}`,
          label: payload.escalate ? "Escalation raised" : "Report submitted",
          detail: `Task ${payload.taskId} reported with confidence ${payload.confidence?.toFixed(2) ?? "n/a"}`,
          tone: payload.escalate ? "warning" : "positive"
        },
        ...items
      ]);
    };

    const onAgentEscalated = (payload: { taskId: string; confidence?: number }) => {
      setActivity((items) => [
        {
          id: `escalated-${payload.taskId}`,
          label: "Agent escalation",
          detail: `Task ${payload.taskId} needs attention at ${payload.confidence?.toFixed(2) ?? "n/a"}`,
          tone: "warning"
        },
        ...items
      ]);
    };

    socket.on("task:assigned", onTaskAssigned);
    socket.on("goal:decomposed", onGoalDecomposed);
    socket.on("task:report_submitted", onReport);
    socket.on("agent:escalated", onAgentEscalated);

    return () => {
      socket.off("task:assigned", onTaskAssigned);
      socket.off("goal:decomposed", onGoalDecomposed);
      socket.off("task:report_submitted", onReport);
      socket.off("agent:escalated", onAgentEscalated);
    };
  }, [role, socket]);

  useEffect(() => {
    const onReconnect = () => setActivity((items) => [
      {
        id: `reconnect-${Date.now()}`,
        label: "Realtime link restored",
        detail: "Socket connection is active again.",
        tone: "positive"
      },
      ...items
    ]);

    socket.on("connect", onReconnect);
    return () => {
      socket.off("connect", onReconnect);
    };
  }, [socket]);

  const taskCount = useOrgosStore((state) => state.myTasks.length);
  const goalCount = useOrgosStore((state) => state.activeGoals.length);

  async function decideMember(memberId: string, decision: "approve" | "reject") {
    try {
      setMemberActionId(memberId);
      if (decision === "approve") {
        await apiFetch(`/api/orgs/members/${memberId}/approve`, { method: "POST" });
      } else {
        const reason = window.prompt("Reason for rejection (minimum 3 characters):", "Insufficient information") ?? "";
        if (reason.trim().length < 3) {
          throw new Error("Rejection reason must be at least 3 characters.");
        }
        await apiFetch(`/api/orgs/members/${memberId}/reject`, {
          method: "POST",
          body: JSON.stringify({ reason })
        });
      }

      setPendingMembers((items) => items.filter((member) => member.id !== memberId));
      setActivity((items) => [
        {
          id: `member-${decision}-${memberId}`,
          label: decision === "approve" ? "Member approved" : "Member rejected",
          detail: `Membership decision recorded for ${memberId}`,
          tone: decision === "approve" ? "positive" : "warning"
        },
        ...items
      ]);
    } catch (error) {
      setActivity((items) => [
        {
          id: `member-error-${memberId}`,
          label: "Member decision failed",
          detail: error instanceof Error ? error.message : "Unable to submit member decision",
          tone: "warning"
        },
        ...items
      ]);
    } finally {
      setMemberActionId(null);
    }
  }

  const stats = [
    { label: "Tasks", value: taskCount },
    { label: "Goals", value: goalCount },
    { label: "Reports", value: reports.length },
    { label: "Realtime", value: wsConnected ? "Live" : "Offline" }
  ];

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-6 px-0 py-3 sm:px-2 lg:px-4">
      <section className="rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[var(--muted)]">{dashboardTitle}</p>
            <h1 className="mt-3 break-words font-serif text-3xl leading-tight text-[var(--ink)] sm:text-4xl lg:text-6xl">
              {currentUser?.full_name ?? "ORGOS Operator"}
            </h1>
            <p className="mt-4 max-w-2xl break-words text-base leading-7 text-[var(--muted)]">
              {roleDescription(role)}
            </p>
          </div>
          <div className={`inline-flex items-center gap-2 self-start rounded-full border px-4 py-2 text-sm font-semibold ${wsConnected ? "border-success/20 bg-success-subtle text-success" : "border-warning/20 bg-warning-subtle text-warning"}`}>
            <span className={`h-2.5 w-2.5 rounded-full ${wsConnected ? "bg-success" : "bg-warning"}`} />
            {wsConnected ? "Realtime connected" : "Connecting realtime"}
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => (
            <article key={stat.label} className="rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
              <p className="text-sm font-medium text-[var(--muted)]">{stat.label}</p>
              <p className="mt-2 text-3xl font-semibold text-[var(--ink)]">{stat.value}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.3fr_0.9fr]">
        <div className="rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
          {(role === "ceo" || role === "cfo") ? (
            <div className="mb-6 rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-[var(--ink)]">Pending approvals</h2>
                  <p className="mt-1 text-sm text-[var(--muted)]">Review and approve member onboarding requests.</p>
                </div>
                <span className="rounded-full bg-[var(--warn)]/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--warn)] sm:tracking-[0.2em]">
                  {pendingMembers.length} pending
                </span>
              </div>

              <div className="mt-4 space-y-3">
                {pendingMembers.slice(0, 8).map((member) => (
                  <article key={member.id} className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
                    <p className="font-semibold text-[var(--ink)]">{member.full_name}</p>
                    <p className="break-all text-sm text-[var(--muted)]">{member.email}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => decideMember(member.id, "approve")}
                        disabled={memberActionId === member.id}
                        className="bg-success text-white hover:bg-success/90"
                      >
                        Approve
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        onClick={() => decideMember(member.id, "reject")}
                        disabled={memberActionId === member.id}
                      >
                        Reject
                      </Button>
                    </div>
                  </article>
                ))}
                {pendingMembers.length === 0 ? <p className="text-sm text-[var(--muted)]">No pending members.</p> : null}
              </div>
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold text-[var(--ink)]">Active work</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Live tasks and goals update here as the queue moves.</p>
            </div>
            {loading ? <span className="text-sm text-[var(--muted)]">Syncing...</span> : null}
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {myTasks.slice(0, 6).map((task) => (
              <article key={task.id} className="min-w-0 rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="min-w-0 break-words text-lg font-semibold text-[var(--ink)]">{task.title}</h3>
                  <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.1em] sm:tracking-[0.2em] ${statusTone(task.status)}`}>
                    {task.status}
                  </span>
                </div>
                <p className="mt-2 break-words text-sm leading-6 text-[var(--muted)]">{task.description ?? task.success_criteria}</p>
              </article>
            ))}
          </div>
        </div>

        <aside className="rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
          <h2 className="text-2xl font-semibold text-[var(--ink)]">Activity feed</h2>
          <div className="mt-5 space-y-3">
            {activity.map((item) => (
              <article key={item.id} className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                <div className="flex items-start gap-3">
                  <span className={`mt-1 h-2.5 w-2.5 rounded-full ${activityDotTone(item.tone)}`} />
                  <div className="min-w-0">
                      <p className="font-semibold text-[var(--ink)]">{item.label}</p>
                      <p className="mt-1 break-words text-sm leading-6 text-[var(--muted)]">{item.detail}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>

          <div className="mt-6 rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-5 text-[var(--ink)]">
            <p className="text-sm uppercase tracking-[0.25em] text-[var(--muted)]">Reports</p>
            <div className="mt-3 space-y-3">
              {reports.slice(0, 3).map((report) => (
                <div key={report.id} className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold">{report.status}</span>
                    <span className="text-sm text-[var(--muted)]">{mapReportTone(report)}</span>
                  </div>
                  <p className="mt-2 break-words text-sm leading-6 text-[var(--muted)]">{report.insight}</p>
                </div>
              ))}
              {reports.length === 0 ? <p className="text-sm text-[var(--muted)]">No reports yet.</p> : null}
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}