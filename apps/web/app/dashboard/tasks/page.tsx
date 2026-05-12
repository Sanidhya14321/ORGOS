import { TaskBoardView } from "@/components/tasks/task-board-view";
import { requireServerSessionUser } from "@/lib/server-session";

type TasksPageProps = {
  searchParams?: {
    goalId?: string | string[];
    taskId?: string | string[];
  };
};

function readParam(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

export default async function TasksPage({ searchParams }: TasksPageProps) {
  await requireServerSessionUser();
  const initialGoalId = readParam(searchParams?.goalId);
  const initialTaskId = readParam(searchParams?.taskId);

  return <TaskBoardView initialGoalId={initialGoalId} initialTaskId={initialTaskId} />;
}