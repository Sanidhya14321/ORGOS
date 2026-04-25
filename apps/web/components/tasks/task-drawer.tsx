"use client";

import { useMemo, useState } from "react";
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
import type { Task } from "@/lib/models";

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

export function TaskDrawer({ task, open, onOpenChange }: { task: Task | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const [commentBody, setCommentBody] = useState("");

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

  const dependsOn = useMemo(() => task?.depends_on ?? [], [task]);

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
                        {a.external_url ? <a className="text-accent" href={a.external_url} target="_blank">Open</a> : null}
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
