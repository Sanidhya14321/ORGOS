"use client";

import { format } from "date-fns";
import { Lock, MessageCircle } from "lucide-react";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { Task } from "@/lib/models";

export function TaskCard({ task, onOpen }: { task: Task; onOpen: (task: Task) => void }) {
  const priorityTone = task.priority === "critical" ? "border-l-danger" : task.priority === "high" ? "border-l-warning" : task.priority === "medium" ? "border-l-info" : "border-l-border";
  const overdue = Boolean(task.is_overdue) || (task.deadline ? new Date(task.deadline).getTime() < Date.now() && task.status !== "completed" : false);

  return (
    <motion.button
      whileHover={{ scale: 1.01 }}
      transition={{ duration: 0.1 }}
      onClick={() => onOpen(task)}
      className={cn("w-full rounded-md border border-border bg-bg-surface p-4 text-left border-l-4", priorityTone)}
    >
      <p className="text-xs text-text-secondary">Goal {task.goal_id.slice(0, 8)}</p>
      <p className="mt-1 text-sm font-semibold text-text-primary">{task.title}</p>

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Avatar className="h-6 w-6"><AvatarFallback>{(task.assigned_role ?? "u").slice(0, 1).toUpperCase()}</AvatarFallback></Avatar>
          <Badge className="bg-bg-subtle text-text-secondary">{task.status}</Badge>
          {task.blocked_by_count && task.blocked_by_count > 0 ? (
            <span className="inline-flex items-center gap-1 text-xs text-warning"><Lock className="h-3 w-3" />blocked</span>
          ) : null}
        </div>
        <span className={cn("text-xs", overdue ? "text-danger" : "text-text-secondary")}>{task.deadline ? format(new Date(task.deadline), "MMM d, yyyy") : "No deadline"}</span>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-text-secondary">
        <span className="inline-flex items-center gap-1"><MessageCircle className="h-3 w-3" /> comments</span>
        <span className={task.sla_status === "breached" ? "text-danger" : task.sla_status === "at_risk" ? "text-warning" : "text-success"}>SLA {task.sla_status ?? "on_track"}</span>
      </div>
    </motion.button>
  );
}
