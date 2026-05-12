"use client";

import { format } from "date-fns";
import { Lock, MessageCircle } from "lucide-react";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { Task } from "@/lib/models";

export function TaskCard({ task, onOpen, suggestionCount }: { task: Task; onOpen: (task: Task) => void; suggestionCount?: number }) {
  const priorityTone = task.priority === "critical" ? "border-l-danger" : task.priority === "high" ? "border-l-warning" : task.priority === "medium" ? "border-l-info" : "border-l-border";
  const overdue = Boolean(task.is_overdue) || (task.deadline ? new Date(task.deadline).getTime() < Date.now() && task.status !== "completed" : false);

  // Extract manager/position context from enriched API response
  const assignedPosition = (task as any).assigned_position_title;
  const assignedToName = (task as any).assigned_to_name;

  return (
    <motion.button
      whileHover={{ scale: 1.01 }}
      transition={{ duration: 0.1 }}
      onClick={() => onOpen(task)}
      className={cn("dashboard-dense-row w-full border border-border bg-[var(--surface)] p-4 text-left border-l-4 shadow-sm transition-all", priorityTone)}
    >
      <p className="dashboard-label">Goal {task.goal_id.slice(0, 8)}</p>
      <p className="mt-2 text-sm font-semibold tracking-tight text-[var(--ink)]">{task.title}</p>

      {/* Position & Assignee Context */}
      {(assignedPosition || assignedToName) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {assignedPosition && (
            <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
              📍 {assignedPosition}
            </Badge>
          )}
          {assignedToName && (
            <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
              👤 {assignedToName}
            </Badge>
          )}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Avatar className="h-6 w-6 border border-[var(--border)] bg-[var(--surface-2)]"><AvatarFallback className="bg-[var(--bg-subtle)] text-[10px] text-[var(--accent)]">{(task.assigned_role ?? "u").slice(0, 1).toUpperCase()}</AvatarFallback></Avatar>
          <Badge className="border border-[var(--border)] bg-[var(--bg-subtle)] text-[10px] text-[var(--muted)]">{task.status}</Badge>
          {task.blocked_by_count && task.blocked_by_count > 0 ? (
            <span className="inline-flex items-center gap-1 text-xs text-[var(--warning)]"><Lock className="h-3 w-3" />blocked</span>
          ) : null}
        </div>
        <span className={cn("text-xs font-medium", overdue ? "text-[var(--danger)]" : "text-[var(--muted)]")}>{task.deadline ? format(new Date(task.deadline), "MMM d, yyyy") : "No deadline"}</span>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-[var(--muted)]">
        <span className="inline-flex items-center gap-1"><MessageCircle className="h-3 w-3" /> comments</span>
        <span className={task.sla_status === "breached" ? "text-[var(--danger)]" : task.sla_status === "at_risk" ? "text-[var(--warning)]" : "text-[var(--success)]"}>SLA {task.sla_status ?? "on_track"}</span>
      </div>

      {suggestionCount ? (
        <div className="absolute right-3 top-3">
          <Badge className="bg-amber-50 text-amber-800">AI {suggestionCount}</Badge>
        </div>
      ) : null}
    </motion.button>
  );
}
