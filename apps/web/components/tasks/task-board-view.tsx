"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { apiFetch } from "@/lib/api";
import { TaskCard } from "@/components/tasks/task-card";
import { TaskDrawer } from "@/components/tasks/task-drawer";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import type { Task } from "@/lib/models";

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

export function TaskBoardView() {
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [query, setQuery] = useState("");

  const tasksQuery = useQuery({
    queryKey: ["tasks", "board"],
    queryFn: () => apiFetch<{ items: Task[] }>("/api/tasks?limit=200"),
    select: (data) => data.items
  });

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
