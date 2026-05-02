"use client";

import { useState, useMemo } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { 
  MoreHorizontal, 
  ChevronDown, 
  ChevronRight, 
  ChevronLeft,
  AlertCircle,
  CheckCircle2,
  Clock
} from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { Goal, Task } from "@/lib/models";

const ITEMS_PER_PAGE = 10;

function statusClass(status: Goal["status"]) {
  const base = "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-colors";
  if (status === "completed") return `${base} bg-green-500/10 text-green-600 border-green-500/20`;
  if (status === "paused") return `${base} bg-amber-500/10 text-amber-600 border-amber-500/20`;
  if (status === "cancelled") return `${base} bg-red-500/10 text-red-600 border-red-500/20`;
  return `${base} bg-blue-500/10 text-blue-600 border-blue-500/20`;
}

export function GoalsTable({ goals, tasks, loading }: { goals: Goal[]; tasks: Task[]; loading: boolean }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  // Pagination Logic
  const totalPages = Math.ceil(goals.length / ITEMS_PER_PAGE);
  const paginatedGoals = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return goals.slice(start, start + ITEMS_PER_PAGE);
  }, [goals, currentPage]);

  if (loading) {
    return (
      <div className="dashboard-dense-row space-y-4 p-6">
        <div className="flex justify-between items-center mb-4">
          <Skeleton className="h-8 w-48 bg-[var(--bg-subtle)]" />
          <Skeleton className="h-8 w-24 bg-[var(--bg-subtle)]" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full bg-[var(--bg-subtle)]" />
        ))}
      </div>
    );
  }

  const PaginationControls = () => (
    <div className="flex items-center justify-between border-t border-[var(--border)] px-4 py-4 bg-[var(--surface)]">
      <p className="text-xs font-medium text-[var(--muted)]">
        Showing <span className="text-[var(--ink)]">{(currentPage - 1) * ITEMS_PER_PAGE + 1}</span> to <span className="text-[var(--ink)]">{Math.min(currentPage * ITEMS_PER_PAGE, goals.length)}</span> of <span className="text-[var(--ink)]">{goals.length}</span> goals
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0 border-[var(--border)] bg-[var(--bg-subtle)]"
          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
          disabled={currentPage === 1}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-1">
          {Array.from({ length: totalPages }).map((_, i) => (
            <Button
              key={i}
              variant={currentPage === i + 1 ? "default" : "ghost"}
              size="sm"
              className={`h-8 w-8 p-0 text-xs ${currentPage === i + 1 ? 'bg-[var(--accent)] text-white' : 'text-[var(--muted)]'}`}
              onClick={() => setCurrentPage(i + 1)}
            >
              {i + 1}
            </Button>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0 border-[var(--border)] bg-[var(--bg-subtle)]"
          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
          disabled={currentPage === totalPages}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Mobile View */}
      <div className="space-y-3 md:hidden">
        {paginatedGoals.map((goal) => {
          const goalTasks = tasks.filter((task) => task.goal_id === goal.id);
          const complete = goalTasks.filter((task) => task.status === "completed").length;
          const pct = goal.completion_pct ?? (goalTasks.length > 0 ? Math.round((complete / goalTasks.length) * 100) : 0);
          const blocked = goal.blocked_count ?? goalTasks.filter((task) => task.status === "blocked").length;
          const deadlineText = goal.deadline
            ? formatDistanceToNowStrict(new Date(goal.deadline), { addSuffix: true })
            : "No SLA";
          const isExpanded = expanded === goal.id;

          return (
            <article key={goal.id} className="dashboard-dense-row overflow-hidden transition-all hover:border-[var(--accent)]/20">
              <button 
                className="flex w-full items-start justify-between p-4 text-left hover:bg-[var(--bg-subtle)]/60 transition-colors" 
                onClick={() => setExpanded(isExpanded ? null : goal.id)}
              >
                <div className="space-y-1 pr-2">
                  <p className="text-sm font-bold tracking-tight text-[var(--ink)]">{goal.title}</p>
                  <p className="line-clamp-1 text-xs text-[var(--muted)]">{goal.description ?? "No description"}</p>
                </div>
                <Badge className={statusClass(goal.status)} variant="outline">{goal.status}</Badge>
              </button>
              
              <div className="px-4 pb-4 space-y-3">
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">
                    <span>Progress</span>
                    <span>{pct}%</span>
                  </div>
                  <Progress value={pct} className="h-1.5" />
                </div>
                
                <div className="flex items-center justify-between border-t border-[var(--border)]/50 pt-1 text-xs">
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3 w-3 text-[var(--muted)]" />
                    <span className={`font-medium ${goal.sla_status === "breached" ? "text-[var(--danger)]" : goal.sla_status === "at_risk" ? "text-[var(--warning)]" : "text-[var(--success)]"}`}>
                      {deadlineText}
                    </span>
                  </div>
                  {blocked > 0 && (
                    <Badge variant="destructive" className="h-5 px-1.5 text-[10px] font-bold">
                      {blocked} BLOCKED
                    </Badge>
                  )}
                </div>
              </div>

              {isExpanded && (
                <div className="bg-[var(--bg-subtle)]/35 p-4 pt-0 animate-in slide-in-from-top-2">
                  <div className="space-y-2 border-t border-[var(--border)] pt-4">
                    <p className="px-1 text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">Sub-tasks</p>
                    {goalTasks.map((task) => (
                      <div key={task.id} className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 transition-colors hover:bg-[var(--surface-2)]">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-[var(--ink)]">{task.title}</p>
                          <p className="text-[10px] text-[var(--muted)]">{task.assigned_role}</p>
                        </div>
                        <Badge variant="secondary" className="text-[9px] h-5">{task.status}</Badge>
                      </div>
                    ))}
                    {goalTasks.length === 0 && <p className="text-xs text-text-secondary italic text-center py-2">No tasks associated</p>}
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {/* Desktop View */}
      <div className="hidden overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface)] md:block shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="border-[var(--border)] bg-[var(--bg-subtle)]/35 hover:bg-transparent">
              <TableHead className="py-4 text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Goal Details</TableHead>
              <TableHead className="py-4 text-[11px] font-bold uppercase tracking-widest text-[var(--muted)] text-center">Status</TableHead>
              <TableHead className="py-4 text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Completion</TableHead>
              <TableHead className="py-4 text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">SLA / Deadline</TableHead>
              <TableHead className="py-4 text-[11px] font-bold uppercase tracking-widest text-[var(--muted)] text-center">Blocked</TableHead>
              <TableHead className="py-4 text-[11px] font-bold uppercase tracking-widest text-[var(--muted)] text-center">Tasks</TableHead>
              <TableHead className="w-[60px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedGoals.map((goal) => {
              const goalTasks = tasks.filter((task) => task.goal_id === goal.id);
              const complete = goalTasks.filter((task) => task.status === "completed").length;
              const pct = goal.completion_pct ?? (goalTasks.length > 0 ? Math.round((complete / goalTasks.length) * 100) : 0);
              const blocked = goal.blocked_count ?? goalTasks.filter((task) => task.status === "blocked").length;
              const isExpanded = expanded === goal.id;
              const deadlineText = goal.deadline
                ? formatDistanceToNowStrict(new Date(goal.deadline), { addSuffix: true })
                : "No SLA";

              return (
                <use key={goal.id}>
                  <TableRow className={`group border-[var(--border)] transition-colors hover:bg-[var(--bg-subtle)]/25 ${isExpanded ? 'bg-[var(--bg-subtle)]/15' : ''}`}>
                    <TableCell className="py-4">
                      <button 
                        className="group/btn flex items-center gap-3 text-left focus:outline-none" 
                        onClick={() => setExpanded(isExpanded ? null : goal.id)}
                      >
                        <div className={`flex h-6 w-6 items-center justify-center rounded-md border border-[var(--border)] transition-colors group-hover/btn:border-[var(--accent)] ${isExpanded ? 'bg-[var(--accent)] text-white border-[var(--accent)]' : 'bg-[var(--surface)]'}`}>
                          {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        </div>
                        <div>
                          <p className="text-sm font-bold tracking-tight text-[var(--ink)] transition-colors group-hover/btn:text-[var(--accent)]">{goal.title}</p>
                          <p className="line-clamp-1 max-w-[240px] text-[11px] font-medium text-[var(--muted)]">{goal.description ?? "No description"}</p>
                        </div>
                      </button>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge className={statusClass(goal.status)} variant="outline">{goal.status}</Badge>
                    </TableCell>
                    <TableCell>
                        <div className="min-w-[140px] space-y-1.5">
                          <div className="flex justify-between text-[10px] font-bold text-[var(--muted)]">
                          <span>{pct}%</span>
                        </div>
                        <Progress value={pct} className="h-1.5" />
                      </div>
                    </TableCell>
                    <TableCell>
                        <div className="flex items-center gap-2">
                        {goal.sla_status === "breached" ? (
                            <AlertCircle className="h-3.5 w-3.5 text-[var(--danger)]" />
                        ) : goal.sla_status === "at_risk" ? (
                            <Clock className="h-3.5 w-3.5 text-[var(--warning)]" />
                        ) : (
                            <CheckCircle2 className="h-3.5 w-3.5 text-[var(--success)]" />
                        )}
                          <span className={`text-xs font-semibold ${goal.sla_status === "breached" ? "text-[var(--danger)]" : goal.sla_status === "at_risk" ? "text-[var(--warning)]" : "text-[var(--success)]"}`}>
                          {deadlineText}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {blocked > 0 ? (
                        <Badge variant="destructive" className="h-6 px-2 text-[10px] font-bold animate-pulse">
                          {blocked}
                        </Badge>
                      ) : (
                        <span className="text-xs text-text-secondary opacity-40">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                        <span className="rounded border border-[var(--border)] bg-[var(--bg-subtle)] px-2 py-1 text-xs font-bold text-[var(--ink)]">{goalTasks.length}</span>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="icon" className="h-8 w-8 text-[var(--muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--ink)]">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40 bg-[var(--surface)] shadow-md ">
                          <DropdownMenuItem className="text-xs font-medium cursor-pointer hover:text-white">Edit Goal</DropdownMenuItem>
                          <DropdownMenuItem className="text-xs font-medium cursor-pointer hover:text-white">View Analytics</DropdownMenuItem>
                          <DropdownMenuItem className="text-xs font-medium cursor-pointer text-red-500 ">Delete Goal</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                  {isExpanded && (
                    <TableRow className="border-[var(--border)] bg-[var(--bg-subtle)]/10 hover:bg-[var(--bg-subtle)]/10">
                      <TableCell colSpan={7} className="p-0">
                        <div className="px-14 py-4 space-y-2 animate-in fade-in slide-in-from-left-4 duration-300">
                          <div className="flex items-center gap-2 mb-2">
                             <div className="h-px w-8 bg-[var(--border)]" />
                             <span className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-widest">Active Tasks</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {goalTasks.map((task) => (
                              <div key={task.id} className="group/task flex flex-col gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 transition-all hover:border-[var(--accent)]/30 hover:shadow-md">
                                <div className="flex justify-between items-start">
                                  <p className="line-clamp-2 text-xs font-bold leading-tight text-[var(--ink)]">{task.title}</p>
                                  <Badge variant="secondary" className="text-[9px] h-4 px-1">{task.status}</Badge>
                                </div>
                                <div className="mt-auto flex items-center gap-2 border-t border-[var(--border)]/50 pt-2">
                                  <div className="flex h-5 w-5 items-center justify-center rounded bg-[var(--accent-subtle)] text-[9px] font-bold text-[var(--accent)]">
                                    {task.assigned_role?.[0] || 'A'}
                                  </div>
                                  <span className="text-[10px] font-medium text-[var(--muted)]">{task.assigned_role}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                          {goalTasks.length === 0 && (
                            <div className="rounded-xl border-2 border-dashed border-[var(--border)] py-6 text-center">
                              <p className="text-xs font-medium text-[var(--muted)]">No tasks assigned to this goal.</p>
                            </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </use>
              );
            })}
          </TableBody>
        </Table>
        <PaginationControls />
      </div>
      
      {/* Mobile Pagination (Syncing with desktop logic) */}
      <div className="md:hidden">
        <PaginationControls />
      </div>
    </div>
  );
}