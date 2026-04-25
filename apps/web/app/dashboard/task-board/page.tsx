import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { TaskBoardView } from "@/components/tasks/task-board-view";
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

  return <TaskBoardView />;
}
