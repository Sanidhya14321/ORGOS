"use client";

import { Bell, CheckCircle2, AlertTriangle, XCircle, UserPlus, BriefcaseBusiness } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import type { PendingMember, Task } from "@/lib/models";

type Notification = {
  id: string;
  title: string;
  description: string;
  at: string;
  type: "task_assigned" | "task_sla_at_risk" | "task_sla_breached" | "task_approved" | "task_rejected" | "member_pending" | "referral_stage" | "interview_scheduled";
  unread?: boolean;
};

function iconForType(type: Notification["type"]) {
  if (type === "task_approved") return <CheckCircle2 className="h-4 w-4 text-success" aria-label="Task approved" />;
  if (type === "task_sla_at_risk") return <AlertTriangle className="h-4 w-4 text-warning" aria-label="SLA at risk" />;
  if (type === "task_sla_breached" || type === "task_rejected") return <XCircle className="h-4 w-4 text-danger" aria-label="SLA breached" />;
  if (type === "member_pending") return <UserPlus className="h-4 w-4 text-accent" aria-label="Member pending" />;
  if (type === "referral_stage" || type === "interview_scheduled") return <BriefcaseBusiness className="h-4 w-4 text-info" aria-label="Recruitment update" />;
  return <Bell className="h-4 w-4 text-info" aria-label="Task assigned" />;
}

export function NotificationsDrawer({ tasks, pendingMembers }: { tasks: Task[]; pendingMembers: PendingMember[] }) {
  const taskNotifications: Notification[] = tasks.slice(0, 8).map((task) => ({
    id: task.id,
    title: task.title,
    description:
      task.sla_status === "breached"
        ? `${task.title} missed its SLA`
        : task.sla_status === "at_risk"
          ? `${task.title} is approaching its deadline`
          : `You are assigned to ${task.title}`,
    at: task.updated_at ?? task.created_at ?? new Date().toISOString(),
    type:
      task.sla_status === "breached"
        ? "task_sla_breached"
        : task.sla_status === "at_risk"
          ? "task_sla_at_risk"
          : "task_assigned",
    unread: true
  }));

  const memberNotifications: Notification[] = pendingMembers.map((member) => ({
    id: `pending-${member.id}`,
    title: "Membership request",
    description: `${member.full_name} is requesting to join`,
    at: member.created_at ?? new Date().toISOString(),
    type: "member_pending",
    unread: true
  }));

  const notifications: Notification[] = [
    ...taskNotifications,
    ...memberNotifications
  ];

  const unreadCount = notifications.filter((item) => item.unread).length;

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="relative border-border bg-bg-elevated text-text-secondary hover:text-text-primary" aria-label="Open notifications">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 ? (
            <span className="absolute -right-2 -top-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[11px] text-white">
              {unreadCount}
            </span>
          ) : null}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full max-w-[380px]">
        <SheetHeader>
          <SheetTitle>Notifications</SheetTitle>
        </SheetHeader>
        <div className="mt-2 flex items-center justify-between">
          <p className="text-xs text-text-secondary">Realtime task and team events</p>
          <Badge className="bg-bg-subtle text-text-secondary">{unreadCount} unread</Badge>
        </div>
        <ScrollArea className="mt-4 h-[calc(100vh-150px)] pr-2">
          <div className="space-y-2">
            {notifications.map((item) => (
              <div key={item.id} className="rounded-md border border-border bg-bg-subtle p-3">
                <div className="flex items-start gap-2">
                  {iconForType(item.type)}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text-primary">{item.title}</p>
                    <p className="text-xs text-text-secondary">{item.description}</p>
                    <p className="mt-1 text-xs text-text-muted">{formatDistanceToNow(new Date(item.at), { addSuffix: true })}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
