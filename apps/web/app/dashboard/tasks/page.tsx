import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { TaskBoardView } from "@/components/tasks/task-board-view";
import { ROLE_COOKIE } from "@/lib/auth";
import type { Role } from "@/lib/models";

const allowedRoles: Role[] = ["ceo", "cfo", "manager", "worker"];

type TasksPageProps = {
  searchParams?: {
    goalId?: string | string[];
    taskId?: string | string[];
  };
};

function readParam(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

export default function TasksPage({ searchParams }: TasksPageProps) {
  const cookieRole = cookies().get(ROLE_COOKIE)?.value as Role | undefined;
  const initialGoalId = readParam(searchParams?.goalId);
  const initialTaskId = readParam(searchParams?.taskId);

  if (!cookieRole) {
    redirect("/login");
  }

  if (!allowedRoles.includes(cookieRole)) {
    redirect("/dashboard");
  }

  return <TaskBoardView initialGoalId={initialGoalId} initialTaskId={initialTaskId} />;
}