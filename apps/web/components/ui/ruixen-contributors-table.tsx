"use client";

import Link from "next/link";
import React, { Fragment, useEffect, useMemo, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api";
import type { Goal, GoalPriority, GoalStatus, Task, User } from "@/lib/models";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  DropdownMenu, 
  DropdownMenuCheckboxItem, 
  DropdownMenuContent, 
  DropdownMenuTrigger,
  DropdownMenuItem 
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import { 
  BarChart3, 
  Users, 
  RefreshCw, 
  ChevronRight, 
  ChevronDown, 
  Clock, 
  AlertCircle, 
  Settings2, 
  ArrowUpRight, 
  Layers, 
  UserPlus,
  CheckCircle2,
  ChevronLeft,
  Activity,
  ShieldAlert
} from "lucide-react";

/* --- Configuration --- */
const ITEMS_PER_PAGE = 10;

/* --- Types (Preserved) --- */
type GoalWithDates = Goal & { created_at?: string; };
type OrgTreeResponse = { orgId: string; nodes: User[]; };
type WorkloadCapacityResponse = {
  items: Array<{
    userId: string; name: string; department: string; role: User["role"];
    openTasks: number; effortHours: number; capacityHours: number;
    capacityScore: number; heat: "low" | "medium" | "high";
  }>;
};
type GoalTaskNode = Task & { children: GoalTaskNode[]; };
type GoalRow = {
  id: string; title: string; status: GoalStatus; priority: GoalPriority;
  createdAt: string; completionPct: number; taskCount: number; overdueCount: number;
  slaRemainingMs: number | null; slaProgressPct: number | null;
  departmentFocus: string; tasks: GoalTaskNode[];
  contributors: Array<{ id: string; name: string; email: string; role: User["role"]; department: string; }>;
};

const allColumns = ["Goal", "Status", "Priority", "Progress", "SLA", "Overdue", "Department", "Tasks", "Created At", "Contributors", "Actions"] as const;
const statusOptions: GoalStatus[] = ["active", "paused", "completed", "cancelled"];

/* --- Utility Helpers --- */
function formatDate(input?: string): string {
  if (!input) return "-";
  const value = new Date(input);
  return Number.isNaN(value.getTime()) ? "-" : value.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatRemaining(ms: number | null): string {
  if (ms === null) return "No SLA";
  if (ms <= 0) return "Breached";
  const totalMinutes = Math.floor(ms / (1000 * 60));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  return days > 0 ? `${days}d ${hours}h` : hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function goalStatusClass(status: GoalStatus): string {
  const base = "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-colors";
  switch (status) {
    case "active": return `${base} bg-green-500/10 text-green-500 border-green-500/20`;
    case "paused": return `${base} bg-amber-500/10 text-amber-500 border-amber-500/20`;
    case "completed": return `${base} bg-blue-500/10 text-blue-500 border-blue-500/20`;
    default: return `${base} bg-slate-500/10 text-slate-400 border-slate-500/20`;
  }
}

function priorityClass(priority: GoalPriority): string {
  const base = "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border";
  switch (priority) {
    case "critical": return `${base} bg-red-500/10 text-red-500 border-red-500/20`;
    case "high": return `${base} bg-orange-500/10 text-orange-500 border-orange-500/20`;
    case "medium": return `${base} bg-sky-500/10 text-sky-500 border-sky-500/20`;
    default: return `${base} bg-slate-500/10 text-slate-400 border-slate-500/20`;
  }
}

function taskStatusClass(status: Task["status"]): string {
  const base = "px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-tight border";
  switch (status) {
    case "completed": return `${base} bg-emerald-500/10 text-emerald-500 border-emerald-500/20`;
    case "in_progress":
    case "active": return `${base} bg-sky-500/10 text-sky-500 border-sky-500/20`;
    case "blocked": return `${base} bg-red-500/10 text-red-500 border-red-500/20`;
    case "pending":
    case "routing": return `${base} bg-amber-500/10 text-amber-500 border-amber-500/20`;
    default: return `${base} bg-slate-500/10 text-slate-400 border-slate-500/20`;
  }
}

/* --- Logic Helpers (Preserved) --- */
function buildTaskTree(tasks: Task[]): GoalTaskNode[] {
  const byId = new Map<string, GoalTaskNode>();
  const roots: GoalTaskNode[] = [];
  for (const task of tasks) byId.set(task.id, { ...task, children: [] });
  for (const task of byId.values()) {
    const parentId = task.parent_id ?? task.parent_task_id ?? null;
    if (!parentId || !byId.has(parentId)) { roots.push(task); continue; }
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

/* --- Main Component --- */
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
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    let active = true;
    async function loadRows() {
      setLoading(true);
      setError(null);
      try {
        const me = await apiFetch<User>("/api/me");
        if (!me.org_id) {
          if (active) { setRows([]); setError("Organization is not configured. Complete org setup first."); }
          return;
        }
        const [goalsRes, tasksRes, treeRes, workloadRes] = await Promise.all([
          apiFetch<{ items: GoalWithDates[] }>("/api/goals?limit=200"),
          apiFetch<{ items: Task[] }>("/api/tasks?limit=600").catch(() => ({ items: [] })),
          apiFetch<OrgTreeResponse>(`/api/orgs/${me.org_id}/tree`).catch(() => ({ orgId: me.org_id as string, nodes: [] })),
          apiFetch<WorkloadCapacityResponse>("/api/tasks/workload/capacity").catch(() => ({ items: [] }))
        ]);
        if (!active) return;
        setOrgUsers(treeRes.nodes);
        setWorkloadItems(workloadRes.items);
        const now = Date.now();
        const tasksByGoal = new Map<string, Task[]>();
        for (const task of tasksRes.items) {
          const list = tasksByGoal.get(task.goal_id) ?? [];
          list.push(task);
          tasksByGoal.set(task.goal_id, list);
        }
        const userById = new Map(treeRes.nodes.map((node) => [node.id, node]));
        const mappedRows: GoalRow[] = goalsRes.items.map((goal) => {
          const goalTasks = tasksByGoal.get(goal.id) ?? [];
          const contributorIds = new Set<string>();
          for (const task of goalTasks) {
            if (task.assigned_to) contributorIds.add(task.assigned_to);
            for (const assigneeId of task.assignees ?? []) contributorIds.add(assigneeId);
          }
          const contributors = Array.from(contributorIds)
            .map((id) => userById.get(id))
            .filter((user): user is User => Boolean(user))
            .map((user) => ({ id: user.id, name: user.full_name, email: user.email, role: user.role, department: user.department ?? "Unassigned" }));
          const departmentFocus = Array.from(new Set(contributors.map((c) => c.department))).join(", ");
          const completedTasks = goalTasks.filter((task) => task.status === "completed").length;
          const completionPct = goalTasks.length === 0 ? 0 : Math.round((completedTasks / goalTasks.length) * 100);
          const openTasks = goalTasks.filter((task) => task.status !== "completed" && task.status !== "cancelled");
          const overdueCount = openTasks.filter((task) => {
            if (task.is_overdue) return true;
            if (!task.deadline) return false;
            const dMs = new Date(task.deadline).getTime();
            return Number.isFinite(dMs) && dMs < now;
          }).length;
          let slaRemainingMs: number | null = null, slaProgressPct: number | null = null, nearestSlaTask: Task | null = null;
          for (const task of openTasks) {
            const target = task.sla_deadline ?? task.deadline;
            if (!target) continue;
            const targetMs = new Date(target).getTime();
            if (!Number.isFinite(targetMs)) continue;
            if (!nearestSlaTask) { nearestSlaTask = task; continue; }
            const nearestMs = new Date((nearestSlaTask.sla_deadline ?? nearestSlaTask.deadline) as string).getTime();
            if (targetMs < nearestMs) nearestSlaTask = task;
          }
          if (nearestSlaTask) {
            const endMs = new Date((nearestSlaTask.sla_deadline ?? nearestSlaTask.deadline) as string).getTime();
            slaRemainingMs = endMs - now;
            if (nearestSlaTask.created_at) {
              const startMs = new Date(nearestSlaTask.created_at).getTime();
              const total = endMs - startMs;
              const elapsed = now - startMs;
              if (Number.isFinite(total) && total > 0) slaProgressPct = Math.max(0, Math.min(100, Math.round((elapsed / total) * 100)));
            }
          }
          return { id: goal.id, title: goal.title, status: goal.status, priority: goal.priority, createdAt: formatDate(goal.created_at), completionPct, taskCount: goal.task_count ?? goalTasks.length, overdueCount, slaRemainingMs, slaProgressPct, departmentFocus: departmentFocus || "Cross-functional", tasks: buildTaskTree(goalTasks), contributors };
        });
        setRows(mappedRows);
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Unable to load data";
        if (active) { setError(msg); setRows([]); }
      } finally { if (active) setLoading(false); }
    }
    void loadRows();
    return () => { active = false; };
  }, []);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const statusMatch = statusFilter === "all" ? true : row.status === statusFilter;
      const search = searchFilter.trim().toLowerCase();
      const searchMatch = search.length === 0 || row.title.toLowerCase().includes(search) || row.departmentFocus.toLowerCase().includes(search) || row.contributors.some((c) => c.name.toLowerCase().includes(search));
      return statusMatch && searchMatch;
    });
  }, [rows, searchFilter, statusFilter]);

  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredRows.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredRows, currentPage]);

  const totalPages = Math.ceil(filteredRows.length / ITEMS_PER_PAGE);

  const capacitySummary = useMemo(() => {
    if (workloadItems.length === 0) return { high: 0, medium: 0, low: 0 };
    let high = 0, medium = 0, low = 0;
    for (const item of workloadItems) {
      if (item.heat === "high") high += 1; else if (item.heat === "medium") medium += 1; else low += 1;
    }
    return { high, medium, low };
  }, [workloadItems]);

  const toggleColumn = (column: string) => setVisibleColumns((prev) => prev.includes(column) ? prev.filter((entry) => entry !== column) : [...prev, column]);
  const toggleExpanded = (goalId: string) => setExpandedGoals((prev) => {
    const next = new Set(prev);
    if (next.has(goalId)) next.delete(goalId); else next.add(goalId);
    return next;
  });

  async function reassignTask(taskId: string) {
    const assignTo = reassignDraft[taskId];
    if (!assignTo) return;
    setReassignBusy(taskId);
    try {
      await apiFetch(`/api/tasks/${taskId}/delegate`, { method: "POST", body: JSON.stringify({ assignTo }) });
      window.location.reload();
    } catch {
      setError("Failed to reassign task. Check permissions.");
    } finally { setReassignBusy(null); }
  }

  /* --- Render Components --- */

  const PaginationControls = () => (
    <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-bg-surface">
      <p className="text-[10px] font-bold uppercase tracking-widest text-text-secondary">
        Page <span className="text-text-primary">{currentPage}</span> of <span className="text-text-primary">{totalPages || 1}</span>
      </p>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" className="h-8 w-8 p-0 border-border bg-bg-subtle" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-1">
          {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
            const pageNum = i + 1;
            return (
              <Button key={pageNum} variant={currentPage === pageNum ? "default" : "ghost"} size="sm" className={`h-8 w-8 p-0 text-[10px] font-bold ${currentPage === pageNum ? 'bg-primary' : 'text-text-secondary'}`} onClick={() => setCurrentPage(pageNum)}>
                {pageNum}
              </Button>
            );
          })}
        </div>
        <Button variant="outline" size="sm" className="h-8 w-8 p-0 border-border bg-bg-subtle" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages || totalPages === 0}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* 1. Bento Capacity Header */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="md:col-span-1 rounded-2xl border border-border bg-bg-surface p-5 flex flex-col justify-between group hover:border-accent/30 transition-all">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-secondary">System Load</p>
            <Activity className="h-4 w-4 text-accent/50 group-hover:text-accent transition-colors" />
          </div>
          <div className="mt-6">
             <div className="flex items-center justify-between text-[10px] font-bold text-text-secondary uppercase mb-2">
               <span>Avg Capacity</span>
               <span className="text-text-primary tracking-tight">
                 {workloadItems.length > 0 ? `${Math.round((workloadItems.reduce((sum, item) => sum + item.capacityScore, 0) / workloadItems.length) * 100)}%` : "-"}
               </span>
             </div>
             <Progress value={workloadItems.length > 0 ? (workloadItems.reduce((sum, item) => sum + item.capacityScore, 0) / workloadItems.length) * 100 : 0} className="h-1.5 bg-bg-subtle" />
          </div>
        </div>

        <div className="md:col-span-2 rounded-2xl border border-border bg-bg-surface p-5 flex items-center justify-between gap-8 hover:border-accent/30 transition-all">
          <div className="flex-1 space-y-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-secondary">Risk Heatmap</p>
            <div className="flex gap-10">
              <div><p className="text-2xl font-bold text-red-500 tracking-tighter">{capacitySummary.high}</p><p className="text-[9px] font-bold text-text-secondary uppercase tracking-widest">Critical</p></div>
              <div><p className="text-2xl font-bold text-amber-500 tracking-tighter">{capacitySummary.medium}</p><p className="text-[9px] font-bold text-text-secondary uppercase tracking-widest">Strained</p></div>
              <div><p className="text-2xl font-bold text-green-500 tracking-tighter">{capacitySummary.low}</p><p className="text-[9px] font-bold text-text-secondary uppercase tracking-widest">Optimized</p></div>
            </div>
          </div>
          <div className="h-full w-px bg-border/50 hidden sm:block" />
          <div className="flex flex-col items-center">
             <Users className="h-6 w-6 text-accent mb-2" />
             <p className="text-xl font-bold text-text-primary tracking-tighter">{workloadItems.filter(i => i.capacityScore >= 1).length}</p>
             <p className="text-[9px] text-text-secondary uppercase font-bold text-center leading-tight">Overloaded<br/>Contributors</p>
          </div>
        </div>

        <div className="md:col-span-1 flex flex-col gap-2">
            <Button variant="outline" className="flex-1 border-border bg-bg-surface hover:bg-bg-elevated transition-all active:scale-95 text-[10px] font-bold uppercase tracking-widest" onClick={() => window.location.reload()} disabled={loading}>
              <RefreshCw className={cn("mr-2 h-3.5 w-3.5", loading && "animate-spin")} /> Refresh Snapshot
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="flex-1 border-border bg-bg-surface hover:bg-bg-elevated transition-all active:scale-95 text-[10px] font-bold uppercase tracking-widest">
                  <Settings2 className="mr-2 h-3.5 w-3.5" /> View Controls
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 bg-bg-surface border-border p-1">
                {allColumns.map((column) => (
                  <DropdownMenuCheckboxItem key={column} checked={visibleColumns.includes(column)} onCheckedChange={() => toggleColumn(column)} className="text-xs font-medium focus:bg-bg-subtle">
                    {column}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
        </div>
      </div>

      {/* 2. Main Strategy & Execution Container */}
      <div className="rounded-3xl border border-border bg-bg-surface overflow-hidden shadow-2xl">
        <div className="p-5 border-b border-border bg-bg-subtle/30 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-[320px]">
             <Input placeholder="Search objectives, ownership, or network nodes..." value={searchFilter} onChange={(e) => setSearchFilter(e.target.value)} className="max-w-md border-border bg-bg-surface h-10 text-xs focus-visible:ring-accent rounded-xl" />
             <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="h-10 rounded-xl border border-border bg-bg-surface px-4 text-xs font-bold uppercase tracking-tight text-text-secondary focus:ring-1 focus:ring-accent outline-none">
                <option value="all">Lifecycle: All</option>
                {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
             </select>
          </div>
          <p className="text-[10px] font-bold text-text-secondary uppercase tracking-[0.2em]">{filteredRows.length} Operational Nodes</p>
        </div>

        {error && <div className="m-4 p-4 bg-red-500/5 border border-red-500/20 rounded-2xl flex items-center gap-3 text-red-500 text-xs font-bold uppercase tracking-tight">
          <ShieldAlert className="h-4 w-4" /> {error}
        </div>}

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent bg-bg-subtle/40">
                {visibleColumns.includes("Goal") && <TableHead className="text-[10px] font-bold uppercase tracking-[0.2em] py-5 px-6">Strategic Objective</TableHead>}
                {visibleColumns.includes("Status") && <TableHead className="text-[10px] font-bold uppercase tracking-[0.2em] text-center">Status</TableHead>}
                {visibleColumns.includes("Priority") && <TableHead className="text-[10px] font-bold uppercase tracking-[0.2em] text-center">Priority</TableHead>}
                {visibleColumns.includes("Progress") && <TableHead className="text-[10px] font-bold uppercase tracking-[0.2em]">Completion</TableHead>}
                {visibleColumns.includes("SLA") && <TableHead className="text-[10px] font-bold uppercase tracking-[0.2em]">SLA Status</TableHead>}
                {visibleColumns.includes("Overdue") && <TableHead className="text-[10px] font-bold uppercase tracking-[0.2em] text-center">Alerts</TableHead>}
                {visibleColumns.includes("Contributors") && <TableHead className="text-[10px] font-bold uppercase tracking-[0.2em] text-center">Network</TableHead>}
                {visibleColumns.includes("Actions") && <TableHead className="w-[80px]" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={visibleColumns.length} className="py-24 text-center"><RefreshCw className="h-8 w-8 animate-spin mx-auto text-accent mb-4 opacity-40" /><p className="text-[10px] font-bold uppercase tracking-[0.3em] text-text-secondary">Syncing Organizational Fabric...</p></TableCell></TableRow>
              ) : paginatedRows.length > 0 ? (
                paginatedRows.map((row) => {
                  const isExpanded = expandedGoals.has(row.id);
                  const slaTone = row.slaRemainingMs !== null && row.slaRemainingMs <= 0 ? "text-red-500" : row.slaProgressPct !== null && row.slaProgressPct >= 80 ? "text-amber-500" : "text-green-500";

                  return (
                    <Fragment key={row.id}>
                      <TableRow className={cn("border-border group transition-all duration-300", isExpanded ? "bg-bg-subtle/20" : "hover:bg-bg-subtle/10")}>
                        {visibleColumns.includes("Goal") && (
                          <TableCell className="py-6 px-6">
                            <button onClick={() => toggleExpanded(row.id)} className="flex items-start gap-4 group/title outline-none">
                               <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border border-border transition-all duration-500 group-hover/title:border-accent group-hover/title:text-accent mt-0.5", isExpanded && "bg-accent border-accent text-white scale-110 shadow-lg shadow-accent/20")}>
                                 {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                               </div>
                               <div className="min-w-0">
                                 <p className="text-sm font-bold text-text-primary tracking-tight group-hover/title:text-accent transition-colors truncate max-w-[280px]">{row.title}</p>
                                 <p className="text-[10px] text-text-secondary font-bold uppercase tracking-widest mt-1 opacity-60">{row.createdAt} • {row.departmentFocus}</p>
                               </div>
                            </button>
                          </TableCell>
                        )}
                        {visibleColumns.includes("Status") && <TableCell className="text-center"><Badge className={cn("shadow-none", goalStatusClass(row.status))}>{row.status}</Badge></TableCell>}
                        {visibleColumns.includes("Priority") && <TableCell className="text-center"><Badge className={cn("shadow-none", priorityClass(row.priority))}>{row.priority}</Badge></TableCell>}
                        {visibleColumns.includes("Progress") && (
                          <TableCell>
                            <div className="min-w-[150px] space-y-2">
                              <div className="flex justify-between text-[10px] font-bold text-text-secondary uppercase tracking-tight"><span>{row.completionPct}% Complete</span></div>
                              <Progress value={row.completionPct} className="h-1.5 bg-bg-subtle" />
                            </div>
                          </TableCell>
                        )}
                        {visibleColumns.includes("SLA") && (
                          <TableCell>
                            <div className="flex items-center gap-2.5">
                               <Clock className={cn("h-3.5 w-3.5", slaTone)} />
                               <span className={cn("text-xs font-bold tracking-tight", slaTone)}>{formatRemaining(row.slaRemainingMs)}</span>
                            </div>
                            {row.slaProgressPct !== null && <p className="text-[10px] text-text-secondary font-bold ml-6 mt-1 opacity-50 uppercase tracking-tighter">{row.slaProgressPct}% Pressure</p>}
                          </TableCell>
                        )}
                        {visibleColumns.includes("Overdue") && (
                          <TableCell className="text-center">
                            {row.overdueCount > 0 ? (
                              <Badge variant="destructive" className="animate-pulse h-6 px-2.5 text-[10px] font-bold tracking-widest rounded-lg">{row.overdueCount} Alerts</Badge>
                            ) : (
                              <span className="text-xs text-text-secondary opacity-30 tracking-widest">—</span>
                            )}
                          </TableCell>
                        )}
                        {visibleColumns.includes("Contributors") && (
                          <TableCell>
                            <div className="flex -space-x-2.5 justify-center">
                              <TooltipProvider>
                                {row.contributors.slice(0, 4).map((c) => (
                                  <Tooltip key={c.id}>
                                    <TooltipTrigger asChild>
                                      <Avatar className="h-8 w-8 border-2 border-bg-surface hover:z-10 cursor-pointer shadow-xl transition-transform hover:-translate-y-1">
                                        <AvatarFallback className="bg-bg-elevated text-[10px] font-bold text-accent">{c.name.charAt(0)}</AvatarFallback>
                                      </Avatar>
                                    </TooltipTrigger>
                                    <TooltipContent className="bg-bg-surface border-border text-xs p-3 rounded-xl shadow-2xl">
                                      <p className="font-bold text-text-primary tracking-tight">{c.name}</p>
                                      <p className="text-[10px] text-text-secondary uppercase font-bold mt-1 opacity-70">{c.role} • {c.department}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                ))}
                                {row.contributors.length > 4 && <div className="h-8 w-8 rounded-full bg-bg-subtle border-2 border-bg-surface flex items-center justify-center text-[10px] font-bold text-text-secondary">+{row.contributors.length - 4}</div>}
                              </TooltipProvider>
                            </div>
                          </TableCell>
                        )}
                        {visibleColumns.includes("Actions") && (
                          <TableCell>
                             <div className="flex items-center gap-1 justify-end px-4">
                                <Button variant="ghost" size="icon" className="h-9 w-9 text-text-secondary hover:text-accent hover:bg-accent/10 rounded-xl" asChild>
                                  <Link href={`/dashboard/task-board?goalId=${row.id}`}><ArrowUpRight className="h-4 w-4" /></Link>
                                </Button>
                                <Button variant="ghost" size="icon" className={cn("h-9 w-9 text-text-secondary transition-all rounded-xl", isExpanded && "text-accent bg-accent/10 scale-110")} onClick={() => toggleExpanded(row.id)}>
                                  <Layers className="h-4 w-4" />
                                </Button>
                             </div>
                          </TableCell>
                        )}
                      </TableRow>

                      {/* 3. High-End Nested Task Tree */}
                      {isExpanded && (
                        <TableRow className="bg-bg-subtle/5 hover:bg-bg-subtle/5">
                          <TableCell colSpan={visibleColumns.length} className="p-0">
                            <div className="px-16 py-8 border-l-2 border-accent/20 mx-6 my-3 animate-in slide-in-from-left-6 duration-500">
                              <div className="flex items-center gap-3 mb-6">
                                <div className="h-px w-10 bg-accent/40" />
                                <h4 className="text-[10px] font-bold uppercase tracking-[0.3em] text-text-primary">Autonomous Flow Hierarchy</h4>
                              </div>
                              {flattenTaskTree(row.tasks).length === 0 ? (
                                <div className="py-8 text-center border border-dashed border-border rounded-[2rem]">
                                   <p className="text-[11px] text-text-secondary italic font-bold uppercase tracking-widest opacity-50">Zero discovered child nodes.</p>
                                </div>
                              ) : (
                                <div className="space-y-3">
                                  {flattenTaskTree(row.tasks).map(({ task, level }) => (
                                    <div key={task.id} className="flex flex-wrap items-center gap-6 rounded-2xl border border-border bg-bg-surface p-4 transition-all duration-300 hover:border-accent/40 group/task hover:shadow-xl" style={{ marginLeft: `${level * 32}px` }}>
                                      <div className="flex-1 min-w-[260px] space-y-1">
                                        <p className="text-xs font-bold text-text-primary tracking-tight leading-tight">{task.title}</p>
                                        <div className="flex items-center gap-2">
                                          <Badge className={cn("shadow-none h-4 px-1.5 text-[8px]", taskStatusClass(task.status))}>{task.status.replace("_", " ")}</Badge>
                                          {task.blocked_by_count && task.blocked_by_count > 0 && (
                                            <div className="flex items-center gap-1 text-red-500 font-bold text-[9px] uppercase tracking-tighter">
                                              <AlertCircle className="h-3 w-3" /> Blocked
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-3">
                                        <select
                                          className="h-9 min-w-[190px] rounded-xl border border-border bg-bg-subtle px-4 text-[10px] font-bold uppercase tracking-tight text-text-secondary outline-none focus:ring-1 focus:ring-accent transition-all"
                                          value={reassignDraft[task.id] ?? ""}
                                          onChange={(e) => setReassignDraft((prev) => ({ ...prev, [task.id]: e.target.value }))}
                                        >
                                          <option value="">Node Delegation</option>
                                          {orgUsers.map((u) => <option key={u.id} value={u.id}>{u.full_name} • {u.role}</option>)}
                                        </select>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-9 px-4 rounded-xl text-accent hover:bg-accent/10 hover:text-accent font-bold text-[10px] uppercase tracking-widest transition-all"
                                          disabled={!reassignDraft[task.id] || reassignBusy === task.id}
                                          onClick={() => void reassignTask(task.id)}
                                        >
                                          {reassignBusy === task.id ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-4 w-4 mr-2" />} Reassign
                                        </Button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })
              ) : (
                <TableRow><TableCell colSpan={visibleColumns.length} className="py-24 text-center text-[11px] text-text-secondary font-bold tracking-[0.3em] uppercase italic opacity-30">Zero nodes match the active filter parameters.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <PaginationControls />
      </div>
    </div>
  );
}

export default ContributorsTable;