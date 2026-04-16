import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { TaskBoard } from "@/components/task-board";
import { ROLE_COOKIE } from "@/lib/auth";
import type { Role } from "@/lib/models";

const allowedRoles: Role[] = ["ceo", "cfo", "manager", "worker"];

export default function TaskBoardPage() {
  const cookieRole = cookies().get(ROLE_COOKIE)?.value as Role | undefined;

  if (!cookieRole) {
    redirect("/login");
  }

  if (!allowedRoles.includes(cookieRole)) {
    redirect("/dashboard");
  }

  return (
    <AppShell
      layout="stack"
      eyebrow="Task operations"
      title="Role-aware task board"
      description="Manage routing, delegation, and execution status in one board tailored to your role permissions."
    >
      <TaskBoard />
    </AppShell>
  );
}
