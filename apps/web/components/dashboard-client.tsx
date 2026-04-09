"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { connectSocket, disconnectSocket, useSocket } from "@/lib/socket";
import { useOrgosStore } from "@/store";
import type { Goal, Report, Role, Task, User } from "@/lib/models";

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

export function DashboardClient({ role }: DashboardClientProps) {
  const socket = useSocket();
  const currentUser = useOrgosStore((state) => state.currentUser);
  const setUser = useOrgosStore((state) => state.setUser);
  const setTasks = useOrgosStore((state) => state.setTasks);
  const setGoals = useOrgosStore((state) => state.setGoals);
  const wsConnected = useOrgosStore((state) => state.wsConnected);
  const myTasks = useOrgosStore((state) => state.myTasks);

  const [reports, setReports] = useState<Report[]>([]);
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
        const taskResponse = await apiFetch<{ items: Task[] }>("/api/tasks?limit=20");
        const goalResponse = role === "ceo" || role === "cfo"
          ? await apiFetch<{ items: Goal[] }>("/api/goals?limit=12")
          : { items: [] as Goal[] };

        const reportResponse = taskResponse.items.length > 0
          ? await apiFetch<{ items: Report[] }>(`/api/reports/${taskResponse.items[0].id}`)
          : { items: [] as Report[] };

        if (cancelled) {
          return;
        }

        setUser(user);
        setTasks(taskResponse.items);
        setGoals(goalResponse.items);
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
  }, [role, setGoals, setTasks, setUser]);

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
  const stats = [
    { label: "Tasks", value: taskCount },
    { label: "Goals", value: goalCount },
    { label: "Reports", value: reports.length },
    { label: "Realtime", value: wsConnected ? "Live" : "Offline" }
  ];

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-8 lg:px-10">
      <section className="rounded-[2rem] border border-white/70 bg-white/75 p-6 shadow-[0_24px_80px_rgba(18,24,38,0.12)] backdrop-blur-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[#6b7280]">{dashboardTitle}</p>
            <h1 className="mt-3 font-serif text-4xl leading-tight text-[#121826] lg:text-6xl">
              {currentUser?.full_name ?? "ORGOS Operator"}
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-[#4b5563]">
              {roleDescription(role)}
            </p>
          </div>
          <div className={`inline-flex items-center gap-2 self-start rounded-full px-4 py-2 text-sm font-semibold ${wsConnected ? "bg-[#e6f5f1] text-[#166c60]" : "bg-[#fff1e8] text-[#9f4f20]"}`}>
            <span className={`h-2.5 w-2.5 rounded-full ${wsConnected ? "bg-[#2a9d8f]" : "bg-[#ff6b35]"}`} />
            {wsConnected ? "Realtime connected" : "Connecting realtime"}
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => (
            <article key={stat.label} className="rounded-3xl border border-[#ece7dd] bg-[#fbfaf7] p-4">
              <p className="text-sm font-medium text-[#6b7280]">{stat.label}</p>
              <p className="mt-2 text-3xl font-semibold text-[#121826]">{stat.value}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.3fr_0.9fr]">
        <div className="rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-[0_24px_80px_rgba(18,24,38,0.1)]">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold text-[#121826]">Active work</h2>
              <p className="mt-1 text-sm text-[#6b7280]">Live tasks and goals update here as the queue moves.</p>
            </div>
            {loading ? <span className="text-sm text-[#6b7280]">Syncing...</span> : null}
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {myTasks.slice(0, 6).map((task) => (
              <article key={task.id} className="rounded-3xl border border-[#ece7dd] bg-[#faf8f4] p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold text-[#121826]">{task.title}</h3>
                  <span className="rounded-full bg-[#fff0e6] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#b45527]">
                    {task.status}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-[#4b5563]">{task.description ?? task.success_criteria}</p>
              </article>
            ))}
          </div>
        </div>

        <aside className="rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-[0_24px_80px_rgba(18,24,38,0.1)]">
          <h2 className="text-2xl font-semibold text-[#121826]">Activity feed</h2>
          <div className="mt-5 space-y-3">
            {activity.map((item) => (
              <article key={item.id} className="rounded-2xl border border-[#ece7dd] bg-[#fbfaf7] p-4">
                <div className="flex items-start gap-3">
                  <span className={`mt-1 h-2.5 w-2.5 rounded-full ${item.tone === "positive" ? "bg-[#2a9d8f]" : item.tone === "warning" ? "bg-[#ff6b35]" : "bg-[#e9c46a]"}`} />
                  <div>
                    <p className="font-semibold text-[#121826]">{item.label}</p>
                    <p className="mt-1 text-sm leading-6 text-[#6b7280]">{item.detail}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>

          <div className="mt-6 rounded-3xl bg-[#121826] p-5 text-white">
            <p className="text-sm uppercase tracking-[0.25em] text-white/60">Reports</p>
            <div className="mt-3 space-y-3">
              {reports.slice(0, 3).map((report) => (
                <div key={report.id} className="rounded-2xl bg-white/8 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold">{report.status}</span>
                    <span className="text-sm text-white/70">{mapReportTone(report)}</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-white/80">{report.insight}</p>
                </div>
              ))}
              {reports.length === 0 ? <p className="text-sm text-white/70">No reports yet.</p> : null}
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}