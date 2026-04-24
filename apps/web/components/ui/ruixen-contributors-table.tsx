"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api";
import type { Goal, GoalPriority, GoalStatus, Task, User } from "@/lib/models";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type GoalWithDates = Goal & {
  created_at?: string;
};

type OrgTreeResponse = {
  orgId: string;
  nodes: User[];
};

type WorkloadCapacityResponse = {
  items: Array<{
    userId: string;
    name: string;
    department: string;
    role: User["role"];
    openTasks: number;
    effortHours: number;
    capacityHours: number;
    capacityScore: number;
    heat: "low" | "medium" | "high";
  }>;
};

type GoalTaskNode = Task & {
  children: GoalTaskNode[];
};

type GoalRow = {
  id: string;
  title: string;
  status: GoalStatus;
  priority: GoalPriority;
  createdAt: string;
  completionPct: number;
  taskCount: number;
  overdueCount: number;
  slaRemainingMs: number | null;
  slaProgressPct: number | null;
  departmentFocus: string;
  tasks: GoalTaskNode[];
  contributors: Array<{
    id: string;
    name: string;
    email: string;
    role: User["role"];
    department: string;
  }>;
};

const allColumns = [
  "Goal",
  "Status",
  "Priority",
  "Progress",
  "SLA",
  "Overdue",
  "Department",
  "Tasks",
  "Created At",
  "Contributors",
  "Actions"
] as const;

const statusOptions: GoalStatus[] = ["active", "paused", "completed", "cancelled"];

function formatDate(input?: string): string {
  if (!input) {
    return "-";
  }

  const value = new Date(input);
  if (Number.isNaN(value.getTime())) {
    return "-";
  }

  return value.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function formatRemaining(ms: number | null): string {
  if (ms === null) {
    return "No SLA";
  }
  if (ms <= 0) {
    return "Breached";
  }

  const totalMinutes = Math.floor(ms / (1000 * 60));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function goalStatusClass(status: GoalStatus): string {
  switch (status) {
    case "active":
      return "bg-green-600 text-white";
    case "paused":
      return "bg-amber-500 text-white";
    case "completed":
      return "bg-blue-600 text-white";
    default:
      return "bg-slate-500 text-white";
  }
}

function priorityClass(priority: GoalPriority): string {
  switch (priority) {
    case "critical":
      return "bg-red-600 text-white";
    case "high":
      return "bg-orange-600 text-white";
    case "medium":
      return "bg-sky-600 text-white";
    default:
      return "bg-slate-400 text-white";
  }
}

function taskStatusClass(status: Task["status"]): string {
  switch (status) {
    case "completed":
      return "bg-emerald-600 text-white";
    case "in_progress":
    case "active":
      return "bg-sky-600 text-white";
    case "blocked":
      return "bg-red-600 text-white";
    case "pending":
    case "routing":
      return "bg-amber-500 text-white";
    default:
      return "bg-slate-500 text-white";
  }
}

function buildTaskTree(tasks: Task[]): GoalTaskNode[] {
  const byId = new Map<string, GoalTaskNode>();
  const roots: GoalTaskNode[] = [];

  for (const task of tasks) {
    byId.set(task.id, { ...task, children: [] });
  }

  for (const task of byId.values()) {
    const parentId = task.parent_id ?? task.parent_task_id ?? null;
    if (!parentId || !byId.has(parentId)) {
      roots.push(task);
      continue;
    }

    byId.get(parentId)?.children.push(task);
  }

  return roots;
}

function flattenTaskTree(nodes: GoalTaskNode[], level = 0): Array<{ task: GoalTaskNode; level: number }> {
  const out: Array<{ task: GoalTaskNode; level: number }> = [];
  for (const node of nodes) {
    out.push({ task: node, level });
    out.push(...flattenTaskTree(node.children, level + 1));
  }
  return out;
}

function ContributorsTable() {
  const [visibleColumns, setVisibleColumns] = useState<string[]>([...allColumns]);
  const [statusFilter, setStatusFilter] = useState<GoalStatus | "all">("all");
  const [searchFilter, setSearchFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<GoalRow[]>([]);
  const [orgUsers, setOrgUsers] = useState<User[]>([]);
  const [expandedGoals, setExpandedGoals] = useState<Set<string>>(new Set());
  const [reassignDraft, setReassignDraft] = useState<Record<string, string>>({});
  const [reassignBusy, setReassignBusy] = useState<string | null>(null);
  const [workloadItems, setWorkloadItems] = useState<WorkloadCapacityResponse["items"]>([]);

  useEffect(() => {
    let active = true;

    async function loadRows() {
      setLoading(true);
      setError(null);

      try {
        const me = await apiFetch<User>("/api/me");
        if (!me.org_id) {
          if (active) {
            setRows([]);
            setError("Organization is not configured yet. Complete org setup first.");
          }
          return;
        }

        const [goalsResponse, tasksResponse, treeResponse, workloadResponse] = await Promise.all([
          apiFetch<{ items: GoalWithDates[] }>("/api/goals?limit=200"),
          apiFetch<{ items: Task[] }>("/api/tasks?limit=600").catch(() => ({ items: [] })),
          apiFetch<OrgTreeResponse>(`/api/orgs/${me.org_id}/tree`).catch(() => ({ orgId: me.org_id as string, nodes: [] })),
          apiFetch<WorkloadCapacityResponse>("/api/tasks/workload/capacity").catch(() => ({ items: [] }))
        ]);

        if (!active) {
          return;
        }

        setOrgUsers(treeResponse.nodes);
        setWorkloadItems(workloadResponse.items);

        const now = Date.now();
        const tasksByGoal = new Map<string, Task[]>();
        for (const task of tasksResponse.items) {
          const list = tasksByGoal.get(task.goal_id) ?? [];
          list.push(task);
          tasksByGoal.set(task.goal_id, list);
        }

        const userById = new Map(treeResponse.nodes.map((node) => [node.id, node]));

        const mappedRows: GoalRow[] = goalsResponse.items.map((goal) => {
          const goalTasks = tasksByGoal.get(goal.id) ?? [];
          const contributorIds = new Set<string>();
          for (const task of goalTasks) {
            if (task.assigned_to) {
              contributorIds.add(task.assigned_to);
            }
            for (const assigneeId of task.assignees ?? []) {
              contributorIds.add(assigneeId);
            }
          }

          const contributors = Array.from(contributorIds)
            .map((id) => userById.get(id))
            .filter((user): user is User => Boolean(user))
            .map((user) => ({
              id: user.id,
              name: user.full_name,
              email: user.email,
              role: user.role,
              department: user.department ?? "Unassigned"
            }));

          const departmentFocus = Array.from(new Set(contributors.map((contributor) => contributor.department))).join(", ");

          const completedTasks = goalTasks.filter((task) => task.status === "completed").length;
          const completionPct = goalTasks.length === 0 ? 0 : Math.round((completedTasks / goalTasks.length) * 100);

          const openTasks = goalTasks.filter((task) => task.status !== "completed" && task.status !== "cancelled");
          const overdueCount = openTasks.filter((task) => {
            if (task.is_overdue) {
              return true;
            }
            if (!task.deadline) {
              return false;
            }
            const deadlineMs = new Date(task.deadline).getTime();
            return Number.isFinite(deadlineMs) && deadlineMs < now;
          }).length;

          let slaRemainingMs: number | null = null;
          let slaProgressPct: number | null = null;
          let nearestSlaTask: Task | null = null;

          for (const task of openTasks) {
            const target = task.sla_deadline ?? task.deadline;
            if (!target) {
              continue;
            }
            const targetMs = new Date(target).getTime();
            if (!Number.isFinite(targetMs)) {
              continue;
            }
            if (!nearestSlaTask) {
              nearestSlaTask = task;
              continue;
            }
            const nearestMs = new Date((nearestSlaTask.sla_deadline ?? nearestSlaTask.deadline) as string).getTime();
            if (targetMs < nearestMs) {
              nearestSlaTask = task;
            }
          }

          if (nearestSlaTask) {
            const endMs = new Date((nearestSlaTask.sla_deadline ?? nearestSlaTask.deadline) as string).getTime();
            slaRemainingMs = endMs - now;

            if (nearestSlaTask.created_at) {
              const startMs = new Date(nearestSlaTask.created_at).getTime();
              const total = endMs - startMs;
              const elapsed = now - startMs;
              if (Number.isFinite(total) && total > 0) {
                slaProgressPct = Math.max(0, Math.min(100, Math.round((elapsed / total) * 100)));
              }
            }
          }

          return {
            id: goal.id,
            title: goal.title,
            status: goal.status,
            priority: goal.priority,
            createdAt: formatDate(goal.created_at),
            completionPct,
            taskCount: goal.task_count ?? goalTasks.length,
            overdueCount,
            slaRemainingMs,
            slaProgressPct,
            departmentFocus: departmentFocus || "Cross-functional",
            tasks: buildTaskTree(goalTasks),
            contributors
          };
        });

        setRows(mappedRows);
      } catch (loadError) {
        const message =
          loadError instanceof ApiError
            ? loadError.message
            : loadError instanceof Error
              ? loadError.message
              : "Unable to load goals data";

        if (active) {
          setError(message);
          setRows([]);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadRows();

    return () => {
      active = false;
    };
  }, []);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const statusMatch = statusFilter === "all" ? true : row.status === statusFilter;
      const search = searchFilter.trim().toLowerCase();
      const searchMatch =
        search.length === 0 ||
        row.title.toLowerCase().includes(search) ||
        row.departmentFocus.toLowerCase().includes(search) ||
        row.contributors.some((contributor) => contributor.name.toLowerCase().includes(search));

      return statusMatch && searchMatch;
    });
  }, [rows, searchFilter, statusFilter]);

  const capacitySummary = useMemo(() => {
    if (workloadItems.length === 0) {
      return { high: 0, medium: 0, low: 0 };
    }

    let high = 0;
    let medium = 0;
    let low = 0;
    for (const item of workloadItems) {
      if (item.heat === "high") {
        high += 1;
      } else if (item.heat === "medium") {
        medium += 1;
      } else {
        low += 1;
      }
    }

    return { high, medium, low };
  }, [workloadItems]);

  const toggleColumn = (column: string) => {
    setVisibleColumns((prev) => (prev.includes(column) ? prev.filter((entry) => entry !== column) : [...prev, column]));
  };

  const toggleExpanded = (goalId: string) => {
    setExpandedGoals((prev) => {
      const next = new Set(prev);
      if (next.has(goalId)) {
        next.delete(goalId);
      } else {
        next.add(goalId);
      }
      return next;
    });
  };

  async function reassignTask(taskId: string) {
    const assignTo = reassignDraft[taskId];
    if (!assignTo) {
      return;
    }

    setReassignBusy(taskId);
    try {
      await apiFetch(`/api/tasks/${taskId}/delegate`, {
        method: "POST",
        body: JSON.stringify({ assignTo })
      });

      window.location.reload();
    } catch {
      setError("Failed to reassign task. Check permissions and try again.");
    } finally {
      setReassignBusy(null);
    }
  }

  return (
    <div className="my-8 space-y-4 overflow-x-auto rounded-lg border border-border bg-background p-4 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold">Execution Goals</h3>
          <p className="text-sm text-muted-foreground">Live completion %, SLA risk, overdue pressure, and inline task tree controls.</p>
        </div>

        <Button variant="outline" size="sm" onClick={() => window.location.reload()} disabled={loading}>
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-md border border-border p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Capacity Heat</p>
          <p className="mt-1 text-sm">High: {capacitySummary.high} users</p>
          <p className="text-sm">Medium: {capacitySummary.medium} users</p>
          <p className="text-sm">Low: {capacitySummary.low} users</p>
        </div>
        <div className="rounded-md border border-border p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Overloaded Contributors</p>
          <p className="mt-1 text-sm font-medium">
            {workloadItems.filter((item) => item.capacityScore >= 1).length} team members at or above 100% capacity
          </p>
        </div>
        <div className="rounded-md border border-border p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Average Load</p>
          <p className="mt-1 text-sm font-medium">
            {workloadItems.length > 0
              ? `${Math.round((workloadItems.reduce((sum, item) => sum + item.capacityScore, 0) / workloadItems.length) * 100)}%`
              : "-"}
          </p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Input
            placeholder="Search by goal, department, contributor..."
            value={searchFilter}
            onChange={(event) => setSearchFilter(event.target.value)}
            className="w-72"
          />

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as GoalStatus | "all")}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="all">All statuses</option>
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              Columns
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-52">
            {allColumns.map((column) => (
              <DropdownMenuCheckboxItem
                key={column}
                checked={visibleColumns.includes(column)}
                onCheckedChange={() => toggleColumn(column)}
              >
                {column}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {error ? <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}

      <Table className="w-full">
        <TableHeader>
          <TableRow>
            {visibleColumns.includes("Goal") ? <TableHead className="min-w-[260px]">Goal</TableHead> : null}
            {visibleColumns.includes("Status") ? <TableHead className="min-w-[120px]">Status</TableHead> : null}
            {visibleColumns.includes("Priority") ? <TableHead className="min-w-[120px]">Priority</TableHead> : null}
            {visibleColumns.includes("Progress") ? <TableHead className="min-w-[180px]">Live Progress</TableHead> : null}
            {visibleColumns.includes("SLA") ? <TableHead className="min-w-[140px]">SLA Timer</TableHead> : null}
            {visibleColumns.includes("Overdue") ? <TableHead className="min-w-[110px]">Overdue</TableHead> : null}
            {visibleColumns.includes("Department") ? <TableHead className="min-w-[160px]">Department Focus</TableHead> : null}
            {visibleColumns.includes("Tasks") ? <TableHead className="min-w-[90px]">Tasks</TableHead> : null}
            {visibleColumns.includes("Created At") ? <TableHead className="min-w-[120px]">Created At</TableHead> : null}
            {visibleColumns.includes("Contributors") ? <TableHead className="min-w-[170px]">Contributors</TableHead> : null}
            {visibleColumns.includes("Actions") ? <TableHead className="min-w-[170px]">Actions</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={visibleColumns.length} className="py-6 text-center text-muted-foreground">
                Loading goals and contributors...
              </TableCell>
            </TableRow>
          ) : filteredRows.length > 0 ? (
            filteredRows.map((row) => {
              const isExpanded = expandedGoals.has(row.id);
              const slaTone =
                row.slaRemainingMs !== null && row.slaRemainingMs <= 0
                  ? "text-red-600"
                  : row.slaProgressPct !== null && row.slaProgressPct >= 80
                    ? "text-amber-600"
                    : "text-muted-foreground";

              return (
                <Fragment key={row.id}>
                  <TableRow>
                    {visibleColumns.includes("Goal") ? <TableCell className="font-medium">{row.title}</TableCell> : null}
                    {visibleColumns.includes("Status") ? (
                      <TableCell>
                        <Badge className={cn("capitalize", goalStatusClass(row.status))}>{row.status}</Badge>
                      </TableCell>
                    ) : null}
                    {visibleColumns.includes("Priority") ? (
                      <TableCell>
                        <Badge className={cn("capitalize", priorityClass(row.priority))}>{row.priority}</Badge>
                      </TableCell>
                    ) : null}
                    {visibleColumns.includes("Progress") ? (
                      <TableCell>
                        <div className="space-y-2">
                          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                            <div className="h-full bg-emerald-500" style={{ width: `${row.completionPct}%` }} />
                          </div>
                          <p className="text-xs text-muted-foreground">{row.completionPct}% completed</p>
                        </div>
                      </TableCell>
                    ) : null}
                    {visibleColumns.includes("SLA") ? (
                      <TableCell>
                        <p className={cn("text-sm font-medium", slaTone)}>{formatRemaining(row.slaRemainingMs)}</p>
                        {row.slaProgressPct !== null ? <p className="text-xs text-muted-foreground">{row.slaProgressPct}% elapsed</p> : null}
                      </TableCell>
                    ) : null}
                    {visibleColumns.includes("Overdue") ? (
                      <TableCell>
                        {row.overdueCount > 0 ? (
                          <Badge className="bg-red-600 text-white">{row.overdueCount} overdue</Badge>
                        ) : (
                          <Badge variant="outline">0</Badge>
                        )}
                      </TableCell>
                    ) : null}
                    {visibleColumns.includes("Department") ? <TableCell>{row.departmentFocus}</TableCell> : null}
                    {visibleColumns.includes("Tasks") ? <TableCell>{row.taskCount}</TableCell> : null}
                    {visibleColumns.includes("Created At") ? <TableCell>{row.createdAt}</TableCell> : null}
                    {visibleColumns.includes("Contributors") ? (
                      <TableCell>
                        {row.contributors.length > 0 ? (
                          <div className="flex -space-x-2">
                            <TooltipProvider>
                              {row.contributors.map((contributor) => (
                                <Tooltip key={contributor.id}>
                                  <TooltipTrigger asChild>
                                    <Avatar className="h-8 w-8 border border-background hover:z-10">
                                      <AvatarFallback>{contributor.name.charAt(0).toUpperCase()}</AvatarFallback>
                                    </Avatar>
                                  </TooltipTrigger>
                                  <TooltipContent className="text-sm">
                                    <p className="font-semibold">{contributor.name}</p>
                                    <p className="text-xs text-muted-foreground">{contributor.email}</p>
                                    <p className="text-xs">{contributor.role.toUpperCase()} - {contributor.department}</p>
                                  </TooltipContent>
                                </Tooltip>
                              ))}
                            </TooltipProvider>
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">No assignees yet</span>
                        )}
                      </TableCell>
                    ) : null}
                    {visibleColumns.includes("Actions") ? (
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            className="text-sm font-medium text-primary hover:underline"
                            onClick={() => toggleExpanded(row.id)}
                          >
                            {isExpanded ? "Hide tasks" : "Expand tree"}
                          </button>
                          <Link href={`/dashboard/task-board?goalId=${row.id}`} className="text-sm font-medium text-primary hover:underline">
                            Open board
                          </Link>
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                  {isExpanded ? (
                    <TableRow>
                      <TableCell colSpan={visibleColumns.length}>
                        <div className="rounded-md border border-border bg-muted/20 p-3">
                          <p className="mb-3 text-sm font-medium">Task tree with quick reassignment</p>
                          {flattenTaskTree(row.tasks).length === 0 ? (
                            <p className="text-sm text-muted-foreground">No tasks found for this goal.</p>
                          ) : (
                            <div className="space-y-2">
                              {flattenTaskTree(row.tasks).map(({ task, level }) => (
                                <div key={task.id} className="flex flex-wrap items-center gap-2 rounded border border-border bg-background p-2" style={{ marginLeft: `${level * 16}px` }}>
                                  <p className="min-w-[220px] text-sm font-medium">{task.title}</p>
                                  <Badge className={cn("capitalize", taskStatusClass(task.status))}>{task.status.replace("_", " ")}</Badge>
                                  {task.blocked_by_count && task.blocked_by_count > 0 ? (
                                    <Badge className="bg-red-600 text-white">Blocked: {task.blocked_by_count}</Badge>
                                  ) : null}
                                  <select
                                    className="h-8 min-w-[200px] rounded-md border border-input bg-background px-2 text-xs"
                                    value={reassignDraft[task.id] ?? ""}
                                    onChange={(event) => setReassignDraft((prev) => ({ ...prev, [task.id]: event.target.value }))}
                                  >
                                    <option value="">Select assignee</option>
                                    {orgUsers.map((user) => (
                                      <option key={user.id} value={user.id}>
                                        {user.full_name} ({user.role})
                                      </option>
                                    ))}
                                  </select>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={!reassignDraft[task.id] || reassignBusy === task.id}
                                    onClick={() => void reassignTask(task.id)}
                                  >
                                    Reassign
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              );
            })
          ) : (
            <TableRow>
              <TableCell colSpan={visibleColumns.length} className="py-6 text-center text-muted-foreground">
                No goals found for the selected filters.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

export default ContributorsTable;
