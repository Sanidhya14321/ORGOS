"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { apiFetch } from "@/lib/api";
import { TaskCard } from "@/components/tasks/task-card";
import { TaskDrawer } from "@/components/tasks/task-drawer";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import type { Task } from "@/lib/models";

type TaskBoardViewProps = {
  initialGoalId?: string;
  initialTaskId?: string;
};

function VirtualTaskColumn({ tasks, onOpen }: { tasks: Task[]; onOpen: (task: Task) => void }) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const rowVirtualizer = useVirtualizer({
    count: tasks.length,
    getScrollElement: () => container,
    estimateSize: () => 172,
    overscan: 6
  });

  return (
    <div ref={setContainer} className="max-h-[65vh] overflow-auto">
      <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: "relative" }}>
        {rowVirtualizer.getVirtualItems().map((item) => {
          const task = tasks[item.index];
          return (
            <div
              key={task.id}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${item.start}px)`
              }}
              className="pb-3"
            >
              <TaskCard task={task} onOpen={onOpen} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function TaskBoardView({ initialGoalId, initialTaskId }: TaskBoardViewProps) {
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [query, setQuery] = useState("");
  const [focusedGoalId, setFocusedGoalId] = useState<string | null>(null);
  const [initialSelectionApplied, setInitialSelectionApplied] = useState(false);

  const tasksQuery = useQuery({
    queryKey: ["tasks", "board"],
    queryFn: () => apiFetch<{ items: Task[] }>("/api/tasks?limit=200"),
    select: (data) => data.items
  });

  useEffect(() => {
    if (initialSelectionApplied || tasksQuery.data === undefined) {
      return;
    }

    const tasks = tasksQuery.data ?? [];
    const initialTask = initialTaskId ? tasks.find((task) => task.id === initialTaskId) : undefined;
    const initialGoalExists = initialGoalId ? tasks.some((task) => task.goal_id === initialGoalId) : false;

    if (initialTask) {
      setSelectedTask(initialTask);
    }

    if (initialGoalExists) {
      setFocusedGoalId(initialGoalId ?? null);
    } else if (!focusedGoalId) {
      setFocusedGoalId(tasks[0]?.goal_id ?? null);
    }

    setInitialSelectionApplied(true);
  }, [focusedGoalId, initialGoalId, initialSelectionApplied, initialTaskId, tasksQuery.data]);

  const filtered = useMemo(
    () => (tasksQuery.data ?? []).filter((task) => task.title.toLowerCase().includes(query.toLowerCase())),
    [query, tasksQuery.data]
  );

  const groups: Array<{ label: string; key: Task["status"] }> = [
    { label: "Pending", key: "pending" },
    { label: "Active", key: "active" },
    { label: "Blocked", key: "blocked" },
    { label: "Completed", key: "completed" }
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-bg-surface px-4 py-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-secondary">Execution focus</p>
          <p className="mt-1 text-sm text-text-primary">
            {focusedGoalId ? `Goal ${focusedGoalId.slice(0, 8)} is highlighted from the projects map.` : "Showing the full task board."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">Tasks and goals linked by goal_id</Badge>
          {selectedTask ? <Badge variant="outline">Task drawer open</Badge> : null}
        </div>
      </div>

      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search tasks"
        className="max-w-sm border-border bg-bg-subtle"
      />

      <div className="grid gap-4 lg:grid-cols-4">
        {groups.map((group) => {
          const items = filtered.filter((task) => task.status === group.key);
          return (
            <div key={group.key} className="rounded-md border border-border bg-bg-surface p-3">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-text-primary">{group.label}</h3>
                <span className="rounded bg-bg-subtle px-2 py-0.5 text-xs text-text-secondary">{items.length}</span>
              </div>
              <div className="space-y-3">
                {tasksQuery.isLoading ? (
                  <>
                    <Skeleton className="h-36 w-full" />
                    <Skeleton className="h-36 w-full" />
                  </>
                ) : (
                  <VirtualTaskColumn tasks={items} onOpen={setSelectedTask} />
                )}
              </div>
            </div>
          );
        })}
      </div>

      <TaskDrawer task={selectedTask} open={Boolean(selectedTask)} onOpenChange={(open) => !open && setSelectedTask(null)} />
    </div>
  );
}
