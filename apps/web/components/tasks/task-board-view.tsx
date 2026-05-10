"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { apiFetch } from "@/lib/api";
import { TaskCard } from "@/components/tasks/task-card";
import { TaskDrawer } from "@/components/tasks/task-drawer";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { Task } from "@/lib/models";
import type { Goal } from "@orgos/shared-types";
import { ChevronDown, X } from "lucide-react";

type TaskBoardViewProps = {
  initialGoalId?: string;
  initialTaskId?: string;
};

function VirtualTaskColumn({ 
  tasks, 
  onOpen,
  onDragStart,
  onDragEnd
}: { 
  tasks: Task[]
  onOpen: (task: Task) => void
  onDragStart?: (task: Task) => void
  onDragEnd?: () => void
}) {
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
              draggable
              onDragStart={() => onDragStart?.(task)}
              onDragEnd={() => onDragEnd?.()}
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
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<Task["status"] | null>(null);
  const allGoalsValue = "__all_goals__";

  const tasksQuery = useQuery({
    queryKey: ["tasks", "board"],
    queryFn: () => apiFetch<{ items: Task[] }>("/api/tasks?limit=200"),
    select: (data) => data.items
  });

  // Get unique goals from available tasks
  const availableGoals = useMemo(() => {
    const goalsSet = new Set((tasksQuery.data ?? []).map((t) => t.goal_id));
    return Array.from(goalsSet).map((goalId) => ({
      id: goalId,
      title: `Goal ${goalId.slice(0, 8)}`
    }));
  }, [tasksQuery.data]);

  const queryClient = useQueryClient();

  // Mutation to update task status when dropped
  const updateTaskStatusMutation = useMutation({
    mutationFn: (params: { taskId: string; newStatus: Task["status"] }) =>
      apiFetch(`/api/tasks/${params.taskId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: params.newStatus })
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks", "board"] });
    }
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
    () => {
      let items = tasksQuery.data ?? [];
      
      // Filter by focused goal if selected
      if (focusedGoalId) {
        items = items.filter((task) => task.goal_id === focusedGoalId);
      }
      
      // Filter by search query
      items = items.filter((task) => task.title.toLowerCase().includes(query.toLowerCase()));
      
      return items;
    },
    [query, tasksQuery.data, focusedGoalId]
  );

  const groups: Array<{ label: string; key: Task["status"] }> = [
    { label: "Pending", key: "pending" },
    { label: "Active", key: "active" },
    { label: "Blocked", key: "blocked" },
    { label: "Completed", key: "completed" }
  ];

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-2xl border border-border bg-bg-surface px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
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

        {/* CEO CONTROLS: Goal & Task Focus */}
        <div className="border-t border-border pt-3">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-text-secondary">CEO Controls</p>
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-xs">
              <label className="mb-1 block text-xs font-medium text-text-secondary">Focus on Goal</label>
              <Select
                value={focusedGoalId || allGoalsValue}
                onValueChange={(value) => setFocusedGoalId(value === allGoalsValue ? null : value)}
              >
                <SelectTrigger className="w-full border-border bg-bg-subtle">
                  <SelectValue placeholder="Select a goal to focus..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={allGoalsValue}>Show all tasks</SelectItem>
                  {availableGoals.map((goal) => (
                    <SelectItem key={goal.id} value={goal.id}>
                      {goal.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {focusedGoalId && (
              <div className="flex items-end">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setFocusedGoalId(null)}
                  className="border-border"
                >
                  <X className="mr-1 h-4 w-4" />
                  Clear Focus
                </Button>
              </div>
            )}
          </div>
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
            <div 
              key={group.key} 
              className={`rounded-md border p-3 transition-colors ${
                dragOverStatus === group.key 
                  ? "border-accent bg-accent/5" 
                  : "border-border bg-bg-surface"
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverStatus(group.key);
              }}
              onDragLeave={() => setDragOverStatus(null)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverStatus(null);
                if (draggedTask && draggedTask.status !== group.key) {
                  updateTaskStatusMutation.mutate({
                    taskId: draggedTask.id,
                    newStatus: group.key
                  });
                }
                setDraggedTask(null);
              }}
            >
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
                  <VirtualTaskColumn 
                    tasks={items} 
                    onOpen={setSelectedTask}
                    onDragStart={(task) => setDraggedTask(task)}
                    onDragEnd={() => setDraggedTask(null)}
                  />
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
