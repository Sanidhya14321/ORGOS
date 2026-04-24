"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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

type GoalRow = {
  id: string;
  title: string;
  status: GoalStatus;
  priority: GoalPriority;
  createdAt: string;
  taskCount: number;
  departmentFocus: string;
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

function ContributorsTable() {
  const [visibleColumns, setVisibleColumns] = useState<string[]>([...allColumns]);
  const [statusFilter, setStatusFilter] = useState<GoalStatus | "all">("all");
  const [searchFilter, setSearchFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<GoalRow[]>([]);

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

        const [goalsResponse, tasksResponse, treeResponse] = await Promise.all([
          apiFetch<{ items: GoalWithDates[] }>("/api/goals?limit=200"),
          apiFetch<{ items: Task[] }>("/api/tasks?limit=400").catch(() => ({ items: [] })),
          apiFetch<OrgTreeResponse>(`/api/orgs/${me.org_id}/tree`).catch(() => ({ orgId: me.org_id as string, nodes: [] }))
        ]);

        if (!active) {
          return;
        }

        const tasksByGoal = new Map<string, Task[]>();
        for (const task of tasksResponse.items) {
          const list = tasksByGoal.get(task.goal_id) ?? [];
          list.push(task);
          tasksByGoal.set(task.goal_id, list);
        }

        const userById = new Map(treeResponse.nodes.map((node) => [node.id, node]));

        const mappedRows: GoalRow[] = goalsResponse.items.map((goal) => {
          const goalTasks = tasksByGoal.get(goal.id) ?? [];
          const contributorIds = new Set(goalTasks.map((task) => task.assigned_to).filter(Boolean) as string[]);

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

          return {
            id: goal.id,
            title: goal.title,
            status: goal.status,
            priority: goal.priority,
            createdAt: formatDate(goal.created_at),
            taskCount: goal.task_count ?? goalTasks.length,
            departmentFocus: departmentFocus || "Cross-functional",
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

  const toggleColumn = (column: string) => {
    setVisibleColumns((prev) => (prev.includes(column) ? prev.filter((entry) => entry !== column) : [...prev, column]));
  };

  return (
    <div className="my-8 space-y-4 overflow-x-auto rounded-lg border border-border bg-background p-4 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold">Execution Goals</h3>
          <p className="text-sm text-muted-foreground">Live backend data from /api/goals, /api/tasks, and /api/orgs/:id/tree.</p>
        </div>

        <Button variant="outline" size="sm" onClick={() => window.location.reload()} disabled={loading}>
          Refresh
        </Button>
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
            {visibleColumns.includes("Goal") ? <TableHead className="min-w-[240px]">Goal</TableHead> : null}
            {visibleColumns.includes("Status") ? <TableHead className="min-w-[120px]">Status</TableHead> : null}
            {visibleColumns.includes("Priority") ? <TableHead className="min-w-[120px]">Priority</TableHead> : null}
            {visibleColumns.includes("Department") ? <TableHead className="min-w-[160px]">Department Focus</TableHead> : null}
            {visibleColumns.includes("Tasks") ? <TableHead className="min-w-[90px]">Tasks</TableHead> : null}
            {visibleColumns.includes("Created At") ? <TableHead className="min-w-[120px]">Created At</TableHead> : null}
            {visibleColumns.includes("Contributors") ? <TableHead className="min-w-[170px]">Contributors</TableHead> : null}
            {visibleColumns.includes("Actions") ? <TableHead className="min-w-[120px]">Actions</TableHead> : null}
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
            filteredRows.map((row) => (
              <TableRow key={row.id}>
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
                    <Link href={`/dashboard/task-board?goalId=${row.id}`} className="text-sm font-medium text-primary hover:underline">
                      Open board
                    </Link>
                  </TableCell>
                ) : null}
              </TableRow>
            ))
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
