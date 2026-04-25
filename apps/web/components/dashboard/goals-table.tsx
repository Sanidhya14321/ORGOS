"use client";

import { useState } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { MoreHorizontal, ChevronDown, ChevronRight } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { Goal, Task } from "@/lib/models";

function statusClass(status: Goal["status"]) {
  if (status === "completed") return "bg-success-subtle text-success";
  if (status === "paused") return "bg-warning-subtle text-warning";
  if (status === "cancelled") return "bg-danger-subtle text-danger";
  return "bg-info-subtle text-info";
}

export function GoalsTable({ goals, tasks, loading }: { goals: Goal[]; tasks: Task[]; loading: boolean }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="space-y-2 rounded-md border border-border bg-bg-surface p-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3 md:hidden">
        {goals.map((goal) => {
          const goalTasks = tasks.filter((task) => task.goal_id === goal.id);
          const complete = goalTasks.filter((task) => task.status === "completed").length;
          const pct = goal.completion_pct ?? (goalTasks.length > 0 ? Math.round((complete / goalTasks.length) * 100) : 0);
          const blocked = goal.blocked_count ?? goalTasks.filter((task) => task.status === "blocked").length;
          const deadlineText = goal.deadline
            ? formatDistanceToNowStrict(new Date(goal.deadline), { addSuffix: true })
            : "No SLA";
          const isExpanded = expanded === goal.id;

          return (
            <article key={goal.id} className="rounded-md border border-border bg-bg-surface p-3">
              <button className="focus-ring flex w-full items-start justify-between text-left" onClick={() => setExpanded(isExpanded ? null : goal.id)}>
                <div>
                  <p className="text-sm font-medium text-text-primary">{goal.title}</p>
                  <p className="text-xs text-text-secondary">{goal.description ?? "No description"}</p>
                </div>
                <Badge className={statusClass(goal.status)}>{goal.status}</Badge>
              </button>
              <div className="mt-3 space-y-2">
                <div>
                  <p className="text-xs text-text-secondary">Progress {pct}%</p>
                  <Progress value={pct} />
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className={goal.sla_status === "breached" ? "text-danger" : goal.sla_status === "at_risk" ? "text-warning" : "text-success"}>{deadlineText}</span>
                  <span className="text-text-secondary">Blocked {blocked}</span>
                </div>
              </div>
              {isExpanded ? (
                <div className="mt-3 space-y-2">
                  {goalTasks.map((task) => (
                    <div key={task.id} className="rounded border border-border bg-bg-subtle px-3 py-2">
                      <p className="text-sm text-text-primary">{task.title}</p>
                      <p className="text-xs text-text-secondary">{task.status} · {task.assigned_role}</p>
                    </div>
                  ))}
                  {goalTasks.length === 0 ? <p className="text-xs text-text-secondary">No tasks yet</p> : null}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      <div className="hidden overflow-hidden rounded-md border border-border bg-bg-surface md:block">
      <Table>
        <TableHeader>
          <TableRow className="border-border hover:bg-transparent">
            <TableHead>Goal</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Progress</TableHead>
            <TableHead>SLA</TableHead>
            <TableHead>Blocked</TableHead>
            <TableHead>Tasks</TableHead>
            <TableHead className="w-[60px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {goals.map((goal) => {
            const goalTasks = tasks.filter((task) => task.goal_id === goal.id);
            const complete = goalTasks.filter((task) => task.status === "completed").length;
            const pct = goal.completion_pct ?? (goalTasks.length > 0 ? Math.round((complete / goalTasks.length) * 100) : 0);
            const blocked = goal.blocked_count ?? goalTasks.filter((task) => task.status === "blocked").length;
            const isExpanded = expanded === goal.id;
            const deadlineText = goal.deadline
              ? formatDistanceToNowStrict(new Date(goal.deadline), { addSuffix: true })
              : "No SLA";

            return (
              <>
                <TableRow key={goal.id} className="border-border">
                  <TableCell>
                    <button className="focus-ring flex items-center gap-2 text-left" onClick={() => setExpanded(isExpanded ? null : goal.id)}>
                      {isExpanded ? <ChevronDown className="h-4 w-4 text-text-secondary" /> : <ChevronRight className="h-4 w-4 text-text-secondary" />}
                      <div>
                        <p className="text-sm font-medium text-text-primary">{goal.title}</p>
                        <p className="text-xs text-text-secondary">{goal.description ?? "No description"}</p>
                      </div>
                    </button>
                  </TableCell>
                  <TableCell><Badge className={statusClass(goal.status)}>{goal.status}</Badge></TableCell>
                  <TableCell>
                    <div className="min-w-[160px] space-y-1">
                      <Progress value={pct} />
                      <p className="text-xs text-text-secondary">{pct}% complete</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className={goal.sla_status === "breached" ? "text-danger" : goal.sla_status === "at_risk" ? "text-warning" : "text-success"}>{deadlineText}</span>
                  </TableCell>
                  <TableCell>{blocked > 0 ? <Badge className="bg-danger-subtle text-danger">{blocked}</Badge> : <span className="text-xs text-text-secondary">0</span>}</TableCell>
                  <TableCell>{goalTasks.length}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger className="focus-ring rounded p-1 text-text-secondary">
                        <MoreHorizontal className="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem>Edit</DropdownMenuItem>
                        <DropdownMenuItem>Pause</DropdownMenuItem>
                        <DropdownMenuItem>View tree</DropdownMenuItem>
                        <DropdownMenuItem className="text-danger">Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
                {isExpanded ? (
                  <TableRow className="border-border bg-bg-subtle/40">
                    <TableCell colSpan={7}>
                      <div className="space-y-2 py-2">
                        {goalTasks.map((task) => (
                          <div key={task.id} className="rounded border border-border bg-bg-subtle px-3 py-2">
                            <p className="text-sm text-text-primary">{task.title}</p>
                            <p className="text-xs text-text-secondary">{task.status} · {task.assigned_role}</p>
                          </div>
                        ))}
                        {goalTasks.length === 0 ? <p className="text-xs text-text-secondary">No tasks yet</p> : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : null}
              </>
            );
          })}
        </TableBody>
      </Table>
      </div>
    </>
  );
}
