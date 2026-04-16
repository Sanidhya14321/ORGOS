import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { DashboardClient } from "@/components/dashboard-client";
import { ROLE_COOKIE } from "@/lib/auth";
import type { Role } from "@/lib/models";

const roles: Role[] = ["ceo", "cfo", "manager", "worker"];

type DashboardRolePageProps = {
  params: { role: string };
};

export default function DashboardRolePage({ params }: DashboardRolePageProps) {
  if (!roles.includes(params.role as Role)) {
    notFound();
  }

  const role = params.role as Role;
  const cookieRole = cookies().get(ROLE_COOKIE)?.value as Role | undefined;

  if (!cookieRole) {
    redirect("/login");
  }

  if (cookieRole !== role) {
    redirect(`/dashboard/${cookieRole}`);
  }

  return (
    <AppShell
      eyebrow="Role dashboard"
      title={`${role.toUpperCase()} command center`}
      description="Live ORGOS dashboards combine tasks, goals, and reports with realtime event delivery."
    >
      <div className="space-y-3 text-sm leading-6 text-[#4b5563]">
        <p>Realtime updates are pushed via Socket.IO and merged into the dashboard feed as the queue advances.</p>
        <p>Continue into the live workspace to monitor task assignments, report submissions, and escalation events.</p>
        <div className="flex flex-wrap gap-2 pt-2">
          <Link
            href="/dashboard/task-board"
            className="inline-flex items-center rounded-2xl border border-[#ddd6c8] bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#121826]"
          >
            Open task board
          </Link>
          {(role === "ceo" || role === "cfo" || role === "manager") ? (
            <Link
              href="/dashboard/org-tree"
              className="inline-flex items-center rounded-2xl border border-[#ddd6c8] bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#121826]"
            >
              Open org tree
            </Link>
          ) : null}
        </div>
      </div>
      <div className="mt-5 rounded-[1.75rem] border border-[#ece7dd] bg-[#fbfaf7] p-4">
        <DashboardClient role={role} />
      </div>
    </AppShell>
  );
}