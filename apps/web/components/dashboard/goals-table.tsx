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
      <div className="space-y-4 rounded-xl border border-border bg-bg-surface p-6">
        <div className="flex justify-between items-center mb-4">
          <Skeleton className="h-8 w-48 bg-bg-subtle" />
          <Skeleton className="h-8 w-24 bg-bg-subtle" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full bg-bg-subtle" />
        ))}
      </div>
    );
  }

  const PaginationControls = () => (
    <div className="flex items-center justify-between px-4 py-4 border-t border-border bg-bg-surface rounded-b-xl">
      <p className="text-xs text-text-secondary font-medium">
        Showing <span className="text-text-primary">{(currentPage - 1) * ITEMS_PER_PAGE + 1}</span> to <span className="text-text-primary">{Math.min(currentPage * ITEMS_PER_PAGE, goals.length)}</span> of <span className="text-text-primary">{goals.length}</span> goals
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0 border-border"
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
              className={`h-8 w-8 p-0 text-xs ${currentPage === i + 1 ? 'bg-primary' : 'text-text-secondary'}`}
              onClick={() => setCurrentPage(i + 1)}
            >
              {i + 1}
            </Button>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0 border-border"
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
            <article key={goal.id} className="rounded-xl border border-border bg-bg-surface overflow-hidden transition-all hover:border-text-secondary/30">
              <button 
                className="flex w-full items-start justify-between p-4 text-left hover:bg-bg-subtle/50 transition-colors" 
                onClick={() => setExpanded(isExpanded ? null : goal.id)}
              >
                <div className="space-y-1 pr-2">
                  <p className="text-sm font-bold text-text-primary tracking-tight">{goal.title}</p>
                  <p className="text-xs text-text-secondary line-clamp-1">{goal.description ?? "No description"}</p>
                </div>
                <Badge className={statusClass(goal.status)} variant="outline">{goal.status}</Badge>
              </button>
              
              <div className="px-4 pb-4 space-y-3">
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-text-secondary">
                    <span>Progress</span>
                    <span>{pct}%</span>
                  </div>
                  <Progress value={pct} className="h-1.5" />
                </div>
                
                <div className="flex items-center justify-between text-xs pt-1 border-t border-border/50">
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3 w-3 text-text-secondary" />
                    <span className={`font-medium ${goal.sla_status === "breached" ? "text-red-500" : goal.sla_status === "at_risk" ? "text-amber-500" : "text-green-500"}`}>
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
                <div className="bg-bg-subtle/50 p-4 pt-0 animate-in slide-in-from-top-2">
                  <div className="space-y-2 border-t border-border pt-4">
                    <p className="text-[10px] font-bold text-text-secondary uppercase tracking-widest px-1">Sub-tasks</p>
                    {goalTasks.map((task) => (
                      <div key={task.id} className="flex items-center justify-between rounded-lg border border-border bg-bg-surface p-3 transition-colors hover:bg-bg-elevated">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-text-primary truncate">{task.title}</p>
                          <p className="text-[10px] text-text-secondary">{task.assigned_role}</p>
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
      <div className="hidden overflow-hidden rounded-xl border border-border bg-bg-surface md:block shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="border-border bg-bg-subtle/30 hover:bg-transparent">
              <TableHead className="py-4 text-[11px] font-bold uppercase tracking-widest text-text-secondary">Goal Details</TableHead>
              <TableHead className="py-4 text-[11px] font-bold uppercase tracking-widest text-text-secondary text-center">Status</TableHead>
              <TableHead className="py-4 text-[11px] font-bold uppercase tracking-widest text-text-secondary">Completion</TableHead>
              <TableHead className="py-4 text-[11px] font-bold uppercase tracking-widest text-text-secondary">SLA / Deadline</TableHead>
              <TableHead className="py-4 text-[11px] font-bold uppercase tracking-widest text-text-secondary text-center">Blocked</TableHead>
              <TableHead className="py-4 text-[11px] font-bold uppercase tracking-widest text-text-secondary text-center">Tasks</TableHead>
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
                  <TableRow className={`group border-border transition-colors hover:bg-bg-subtle/30 ${isExpanded ? 'bg-bg-subtle/20' : ''}`}>
                    <TableCell className="py-4">
                      <button 
                        className="group/btn flex items-center gap-3 text-left focus:outline-none" 
                        onClick={() => setExpanded(isExpanded ? null : goal.id)}
                      >
                        <div className={`flex h-6 w-6 items-center justify-center rounded-md border border-border transition-colors group-hover/btn:border-text-secondary ${isExpanded ? 'bg-primary text-white border-primary' : 'bg-bg-surface'}`}>
                          {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-text-primary tracking-tight group-hover/btn:text-primary transition-colors">{goal.title}</p>
                          <p className="text-[11px] text-text-secondary line-clamp-1 max-w-[240px] font-medium">{goal.description ?? "No description"}</p>
                        </div>
                      </button>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge className={statusClass(goal.status)} variant="outline">{goal.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="min-w-[140px] space-y-1.5">
                        <div className="flex justify-between text-[10px] font-bold text-text-secondary">
                          <span>{pct}%</span>
                        </div>
                        <Progress value={pct} className="h-1.5" />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {goal.sla_status === "breached" ? (
                          <AlertCircle className="h-3.5 w-3.5 text-red-500" />
                        ) : goal.sla_status === "at_risk" ? (
                          <Clock className="h-3.5 w-3.5 text-amber-500" />
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                        )}
                        <span className={`text-xs font-semibold ${goal.sla_status === "breached" ? "text-red-500" : goal.sla_status === "at_risk" ? "text-amber-500" : "text-green-500"}`}>
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
                      <span className="text-xs font-bold text-text-primary bg-bg-subtle px-2 py-1 rounded border border-border">{goalTasks.length}</span>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-text-secondary hover:text-text-primary hover:bg-bg-elevated">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem className="text-xs font-medium cursor-pointer">Edit Goal</DropdownMenuItem>
                          <DropdownMenuItem className="text-xs font-medium cursor-pointer">View Analytics</DropdownMenuItem>
                          <DropdownMenuItem className="text-xs font-medium cursor-pointer text-red-500">Delete Goal</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                  {isExpanded && (
                    <TableRow className="border-border bg-bg-subtle/10 hover:bg-bg-subtle/10">
                      <TableCell colSpan={7} className="p-0">
                        <div className="px-14 py-4 space-y-2 animate-in fade-in slide-in-from-left-4 duration-300">
                          <div className="flex items-center gap-2 mb-2">
                             <div className="h-px w-8 bg-border" />
                             <span className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">Active Tasks</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {goalTasks.map((task) => (
                              <div key={task.id} className="group/task flex flex-col gap-2 rounded-xl border border-border bg-bg-surface p-4 transition-all hover:shadow-md hover:border-primary/30">
                                <div className="flex justify-between items-start">
                                  <p className="text-xs font-bold text-text-primary leading-tight line-clamp-2">{task.title}</p>
                                  <Badge variant="secondary" className="text-[9px] h-4 px-1">{task.status}</Badge>
                                </div>
                                <div className="flex items-center gap-2 mt-auto pt-2 border-t border-border/50">
                                  <div className="h-5 w-5 rounded bg-primary/10 flex items-center justify-center text-[9px] text-primary font-bold">
                                    {task.assigned_role?.[0] || 'A'}
                                  </div>
                                  <span className="text-[10px] font-medium text-text-secondary">{task.assigned_role}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                          {goalTasks.length === 0 && (
                            <div className="text-center py-6 border-2 border-dashed border-border rounded-xl">
                              <p className="text-xs text-text-secondary font-medium">No tasks assigned to this goal.</p>
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