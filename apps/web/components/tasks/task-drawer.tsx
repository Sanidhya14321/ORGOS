"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import { useSocket } from "@/lib/socket";
import { toast } from "sonner";
import type { Task, User } from "@/lib/models";

type Comment = {
  id: string;
  body: string;
  created_at: string;
  author_id?: string;
  parent_comment_id?: string | null;
};

type Attachment = {
  id: string;
  title?: string;
  attachment_type: "file" | "link" | "form";
  external_url?: string;
  created_at: string;
};

type RoutingSuggestion = {
  assigneeId: string;
  reason: string;
  confidence: number;
};

type WorkloadItem = {
  userId: string;
  name: string;
  department?: string | null;
  role: string;
  openTasks: number;
  effortHours: number;
  capacityHours: number;
  capacityScore: number;
  heat: "low" | "medium" | "high";
};

function isRoutingRole(role?: string | null): boolean {
  return role === "ceo" || role === "cfo" || role === "manager";
}

export function TaskDrawer({ task, open, onOpenChange }: { task: Task | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const socket = useSocket();
  const [commentBody, setCommentBody] = useState("");
  const [routingSuggestions, setRoutingSuggestions] = useState<RoutingSuggestion[]>([]);
  const [routingStatus, setRoutingStatus] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<Record<string, boolean>>({});

  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: () => apiFetch<User>("/api/me").catch(() => null),
    enabled: open
  });

  const canRequestRouting = isRoutingRole(meQuery.data?.role);

  const workloadQuery = useQuery({
    queryKey: ["tasks", "workload", "capacity"],
    queryFn: () => apiFetch<{ items: WorkloadItem[] }>("/api/tasks/workload/capacity"),
    select: (data) => data.items,
    enabled: Boolean(task?.id && open && canRequestRouting)
  });

  const commentsQuery = useQuery({
    queryKey: ["task-comments", task?.id],
    queryFn: () => apiFetch<{ items: Comment[] }>(`/api/tasks/${task?.id}/comments`),
    select: (data) => data.items,
    enabled: Boolean(task?.id && open)
  });

  const attachmentsQuery = useQuery({
    queryKey: ["task-attachments", task?.id],
    queryFn: () => apiFetch<{ items: Attachment[] }>(`/api/tasks/${task?.id}/attachments`),
    select: (data) => data.items,
    enabled: Boolean(task?.id && open)
  });

  const addCommentMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/tasks/${task?.id}/comments`, {
        method: "POST",
        body: JSON.stringify({ body: commentBody, mentions: [] })
      }),
    onSuccess: () => {
      setCommentBody("");
      queryClient.invalidateQueries({ queryKey: ["task-comments", task?.id] });
    }
  });

  const requestRoutingMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ status?: string; taskId?: string; suggestions?: RoutingSuggestion[] }>(`/api/tasks/${task?.id}/routing-suggest`, {
        method: "POST",
        body: JSON.stringify({})
      }),
    onSuccess: (response) => {
      const suggestions = response.suggestions ?? [];
      setRoutingSuggestions(suggestions);

      if (suggestions.length > 0) {
        setRoutingStatus(`Received ${suggestions.length} routing suggestion${suggestions.length === 1 ? "" : "s"}.`);
        toast.success(`Routing suggestions ready for ${task?.title ?? "this task"}.`);
        return;
      }

      if (response.status === "routing_in_progress") {
        setRoutingStatus("Routing request queued. Suggestions will appear when the worker finishes.");
        toast.info("Routing request queued.");
        return;
      }

      setRoutingStatus("Routing request submitted.");
      toast.success("Routing request submitted.");
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Unable to request routing suggestions";
      setRoutingStatus(message);
      toast.error(message);
    }
  });

  const confirmRoutingMutation = useMutation({
    mutationFn: (confirmed: RoutingSuggestion[]) =>
      apiFetch(`/api/tasks/${task?.id}/routing-confirm`, {
        method: "POST",
        body: JSON.stringify({ confirmed, status: "active" })
      }),
    onSuccess: () => {
      setRoutingSuggestions([]);
      setRoutingStatus("Routing confirmed and saved.");
      toast.success("Routing confirmed.");
      void queryClient.invalidateQueries({ queryKey: ["tasks", "board"] });
      void queryClient.invalidateQueries({ queryKey: ["task", task?.id] });
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : "Failed to confirm routing";
      toast.error(message);
    }
  });

  const delegateMutation = useMutation({
    mutationFn: (assigneeId: string) =>
      apiFetch(`/api/tasks/${task?.id}/delegate`, {
        method: "POST",
        body: JSON.stringify({ assignTo: assigneeId })
      }),
    onSuccess: (updated) => {
      toast.success("Task assigned");
      void queryClient.invalidateQueries({ queryKey: ["tasks", "board"] });
      void queryClient.invalidateQueries({ queryKey: ["task", task?.id] });
      // remove suggestions after assignment to avoid duplicate actions
      setRoutingSuggestions([]);
      setRoutingStatus("Assigned");
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : "Failed to assign task";
      toast.error(message);
    }
  });

  const handleAssign = async (assigneeId: string) => {
    setAssigning((s) => ({ ...s, [assigneeId]: true }));
    try {
      await delegateMutation.mutateAsync(assigneeId);
    } catch (err) {
      // error handled in mutation onError
    } finally {
      setAssigning((s) => ({ ...s, [assigneeId]: false }));
    }
  };

  const dependsOn = useMemo(() => task?.depends_on ?? [], [task]);

  const capacityByUser = useMemo(() => {
    return new Map((workloadQuery.data ?? []).map((item) => [item.userId, item]));
  }, [workloadQuery.data]);

  const topCapacity = useMemo(() => {
    return (workloadQuery.data ?? [])
      .slice()
      .sort((a, b) => b.capacityScore - a.capacityScore)
      .slice(0, 5);
  }, [workloadQuery.data]);

  useEffect(() => {
    setRoutingSuggestions([]);
    setRoutingStatus(null);
  }, [task?.id]);

  useEffect(() => {
    if (!task?.id || !open) {
      return;
    }

    const onRoutingReady = (payload: { taskId?: string; suggestions?: RoutingSuggestion[] }) => {
      if (payload.taskId !== task.id) {
        return;
      }

      const suggestions = payload.suggestions ?? [];
      setRoutingSuggestions(suggestions);
      setRoutingStatus(
        suggestions.length > 0
          ? `Routing suggestions ready: ${suggestions.length} candidate${suggestions.length === 1 ? "" : "s"}.`
          : "Routing suggestions ready."
      );
      toast.success(`Routing suggestions ready for ${task.title}.`);
    };

    socket.on("task:routing_ready", onRoutingReady);

    return () => {
      socket.off("task:routing_ready", onRoutingReady);
    };
  }, [open, socket, task?.id, task?.title]);

  const suggestionCards = routingSuggestions.map((suggestion) => {
    const workload = capacityByUser.get(suggestion.assigneeId);
    return { suggestion, workload };
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="max-w-[640px]">
        {!task ? null : (
          <ScrollArea className="h-full pr-4">
            <SheetHeader>
              <SheetTitle>{task.title}</SheetTitle>
              <SheetDescription>Goal {task.goal_id}</SheetDescription>
            </SheetHeader>

            <div className="mt-4 space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge className="bg-bg-subtle text-text-secondary">{task.priority ?? "medium"}</Badge>
                <Badge className="bg-bg-subtle text-text-secondary">{task.status}</Badge>
                <Badge className={task.sla_status === "breached" ? "bg-danger-subtle text-danger" : task.sla_status === "at_risk" ? "bg-warning-subtle text-warning" : "bg-success-subtle text-success"}>
                  SLA {task.sla_status ?? "on_track"}
                </Badge>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-text-primary">Description</p>
                <Textarea value={task.description ?? ""} readOnly className="min-h-[90px] border-border bg-bg-subtle" />
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-text-primary">Success criteria</p>
                <p className="rounded-md border border-border bg-bg-subtle p-3 text-sm text-text-secondary">{task.success_criteria}</p>
              </div>

              <Separator />

              <div className="space-y-3 rounded-lg border border-border bg-bg-subtle p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-text-primary">Routing assistance</p>
                    <p className="text-xs text-text-secondary">
                      Request LLM-backed routing suggestions and review team capacity before assigning this task.
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    className="bg-accent hover:bg-accent-hover"
                    disabled={!canRequestRouting || requestRoutingMutation.isPending}
                    onClick={() => requestRoutingMutation.mutate()}
                  >
                    {requestRoutingMutation.isPending ? "Requesting..." : "Suggest routing"}
                  </Button>
                </div>

                {routingStatus ? <p className="text-xs text-text-secondary">{routingStatus}</p> : null}

                {!canRequestRouting ? (
                  <p className="text-xs text-text-secondary">Routing suggestions are available to executives and managers only.</p>
                ) : null}

                {workloadQuery.isLoading ? (
                  <Skeleton className="h-16 w-full" />
                ) : topCapacity.length > 0 ? (
                  <div className="space-y-3">
                    <p className="text-xs font-medium uppercase tracking-[0.12em] text-text-secondary">Team capacity</p>
                    <div className="space-y-2">
                      {topCapacity.map((item) => (
                        <div key={item.userId} className="space-y-1 rounded-md border border-border bg-bg-surface p-2">
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="font-medium text-text-primary">{item.name}</span>
                            <span className="text-text-secondary">
                              {item.openTasks}/{item.capacityHours}h · {Math.round(item.capacityScore * 100)}%
                            </span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-bg-subtle">
                            <div
                              className={`h-full rounded-full ${item.heat === "high" ? "bg-danger" : item.heat === "medium" ? "bg-warning" : "bg-success"}`}
                              style={{ width: `${Math.min(item.capacityScore * 100, 100)}%` }}
                            />
                          </div>
                          <p className="text-[11px] text-text-secondary">
                            {item.role.toUpperCase()} · {item.department ?? "Unassigned"}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {suggestionCards.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-[0.12em] text-text-secondary">Suggested assignees</p>
                    <div className="space-y-2">
                      {suggestionCards.map(({ suggestion, workload }) => (
                        <div key={suggestion.assigneeId} className="rounded-md border border-border bg-bg-surface p-3">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <p className="text-sm font-medium text-text-primary">{workload?.name ?? suggestion.assigneeId}</p>
                              <p className="text-xs text-text-secondary">
                                {workload?.role?.toUpperCase() ?? "ASSIGNEE"} · {workload?.department ?? "No department"}
                              </p>
                            </div>
                            <Badge className="bg-bg-subtle text-text-secondary">
                              {Math.round(suggestion.confidence * 100)}%
                            </Badge>
                          </div>
                          <p className="mt-2 text-xs text-text-secondary">{suggestion.reason}</p>
                          <div className="mt-3 flex items-center gap-2">
                            <Button
                              size="sm"
                              onClick={() => handleAssign(suggestion.assigneeId)}
                              disabled={Boolean(assigning[suggestion.assigneeId]) || delegateMutation.isPending}
                            >
                              {assigning[suggestion.assigneeId] ? "Assigning..." : "Assign"}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => navigator.clipboard?.writeText(suggestion.assigneeId)}>
                              Copy ID
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                      <div className="pt-2">
                        <Button
                          size="sm"
                          onClick={() => confirmRoutingMutation.mutate(routingSuggestions)}
                          disabled={confirmRoutingMutation.isPending || routingSuggestions.length === 0}
                          className="mt-2"
                        >
                          {confirmRoutingMutation.isPending ? "Confirming..." : "Confirm suggestions"}
                        </Button>
                      </div>
                    </div>
                ) : null}
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-text-primary">Dependencies</p>
                {dependsOn.length === 0 ? <p className="text-xs text-text-secondary">No blockers</p> : dependsOn.map((dep) => <p key={dep} className="text-xs text-text-secondary">Blocked by {dep}</p>)}
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-text-primary">Attachments</p>
                {attachmentsQuery.isLoading ? (
                  <Skeleton className="h-14 w-full" />
                ) : (
                  <div className="space-y-2">
                    {(attachmentsQuery.data ?? []).map((a) => (
                      <div key={a.id} className="rounded border border-border bg-bg-subtle p-3 text-xs text-text-secondary">
                        <p className="text-sm text-text-primary">{a.title ?? a.attachment_type}</p>
                        {a.external_url ? <a className="text-accent" href={a.external_url} target="_blank" rel="noreferrer">Open</a> : null}
                      </div>
                    ))}
                    {(attachmentsQuery.data ?? []).length === 0 ? <p className="text-xs text-text-secondary">No attachments</p> : null}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-text-primary">Comments</p>
                <div className="space-y-2">
                  {commentsQuery.isLoading ? (
                    <>
                      <Skeleton className="h-16 w-full" />
                      <Skeleton className="h-16 w-full" />
                      <Skeleton className="h-16 w-full" />
                    </>
                  ) : (
                    (commentsQuery.data ?? []).map((comment) => (
                      <div key={comment.id} className="rounded border border-border bg-bg-subtle p-3">
                        <p className="text-sm text-text-primary">{comment.body}</p>
                        <p className="mt-1 text-xs text-text-muted">{new Date(comment.created_at).toLocaleString()}</p>
                      </div>
                    ))
                  )}
                </div>

                <div className="space-y-2 pt-1">
                  <Input
                    value={commentBody}
                    onChange={(e) => setCommentBody(e.target.value)}
                    placeholder="Write a comment. Use @name mentions."
                    className="border-border bg-bg-subtle"
                  />
                  <Button className="bg-accent hover:bg-accent-hover" disabled={addCommentMutation.isPending || commentBody.trim().length < 2} onClick={() => addCommentMutation.mutate()}>
                    Add comment
                  </Button>
                </div>
              </div>
            </div>
          </ScrollArea>
        )}
      </SheetContent>
    </Sheet>
  );
}
