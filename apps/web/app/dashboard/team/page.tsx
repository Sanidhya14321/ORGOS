'use client';

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { DashboardPageFrame } from "@/components/dashboard/dashboard-surface";
import { apiFetch } from "@/lib/api";
import type { Task, User } from "@/lib/models";
import {
  ArrowUpRight,
  Download,
  Hash,
  KeyRound,
  Link2,
  Mail,
  MessageSquareText,
  RefreshCw,
  Send,
  ShieldCheck,
  Users
} from "lucide-react";
import { toast } from "sonner";

type TeamMember = User & {
  position_title?: string | null;
};

type OrgTreeMember = {
  id: string;
  user_id?: string | null;
  full_name: string;
  email?: string | null;
  role: User["role"];
  department?: string | null;
  position_title?: string | null;
};

type SeatRecord = {
  position_id: string;
  position_title: string;
  level: number;
  department?: string | null;
  branch_name?: string | null;
  power_level: number;
  visibility_scope: string;
  seat_label?: string | null;
  assignment_status: string;
  activation_state: string;
  occupant_name?: string | null;
  occupant_email?: string | null;
  invite_email?: string | null;
  email?: string | null;
  invite_code?: string | null;
  invitation_url?: string | null;
  force_password_change: boolean;
};

type ResetAccessResponse = {
  plaintext_password: string;
  email: string;
  invite_code?: string;
  invitation_url?: string;
};

type Comment = {
  id: string;
  body: string;
  created_at: string;
  author_id?: string | null;
};

function formatTimestamp(value?: string | null): string {
  if (!value) {
    return "No recent updates";
  }
  return new Date(value).toLocaleString();
}

function statusTone(status?: string | null): string {
  if (status === "completed" || status === "activated" || status === "active") {
    return "bg-success-subtle text-success border border-success/20";
  }
  if (status === "blocked" || status === "breached") {
    return "bg-danger-subtle text-danger border border-danger/20";
  }
  if (status === "pending" || status === "routing") {
    return "bg-warning-subtle text-warning border border-warning/20";
  }
  return "bg-bg-elevated text-text-secondary border border-border";
}

export default function TeamPage() {
  const queryClient = useQueryClient();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [messageBody, setMessageBody] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, string>>({});

  const meQuery = useQuery({
    queryKey: ["team-me"],
    queryFn: () => apiFetch<User>("/api/me")
  });

  const tasksQuery = useQuery({
    queryKey: ["team-workspace-tasks"],
    queryFn: () => apiFetch<{ items: Task[] }>("/api/tasks?limit=40"),
    select: (data) => data.items ?? [],
    enabled: Boolean(meQuery.data?.id)
  });

  const membersQuery = useQuery({
    queryKey: ["team-members", meQuery.data?.org_id],
    queryFn: () => apiFetch<{ nodes: OrgTreeMember[] }>(`/api/orgs/${meQuery.data?.org_id}/tree`),
    select: (data) =>
      (data.nodes ?? [])
        .filter((node) => Boolean(node.user_id))
        .map((node) => ({
          id: node.user_id as string,
          email: node.email ?? "",
          full_name: node.full_name,
          role: node.role,
          status: "active" as const,
          department: node.department ?? undefined,
          position_id: node.id,
          position_title: node.position_title ?? null
        })),
    enabled: Boolean(meQuery.data?.org_id)
  });

  const seatsQuery = useQuery({
    queryKey: ["team-directory", meQuery.data?.org_id],
    queryFn: () => apiFetch<{ items: SeatRecord[] }>(`/api/onboarding/org/${meQuery.data?.org_id}/team-directory`),
    select: (data) => data.items ?? [],
    enabled: Boolean(meQuery.data?.org_id) && meQuery.data?.role === "ceo"
  });

  const commentsQuery = useQuery({
    queryKey: ["team-comments", selectedTaskId],
    queryFn: () => apiFetch<{ items: Comment[] }>(`/api/tasks/${selectedTaskId}/comments`),
    select: (data) => data.items ?? [],
    enabled: Boolean(selectedTaskId)
  });

  const postCommentMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/tasks/${selectedTaskId}/comments`, {
        method: "POST",
        body: JSON.stringify({ body: messageBody, mentions: [] })
      }),
    onSuccess: () => {
      setMessageBody("");
      toast.success("Message posted to the task thread.");
      void queryClient.invalidateQueries({ queryKey: ["team-comments", selectedTaskId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unable to post message");
    }
  });

  const resetAccessMutation = useMutation({
    mutationFn: (positionId: string) =>
      apiFetch<ResetAccessResponse>(`/api/onboarding/org/${meQuery.data?.org_id}/positions/${positionId}/reset-password`, {
        method: "POST",
        body: JSON.stringify({})
      }),
    onSuccess: (data, positionId) => {
      setRevealedPasswords((previous) => ({
        ...previous,
        [positionId]: data.plaintext_password
      }));
      toast.success("Seat access refreshed. Share the invite or temporary password securely.");
      void queryClient.invalidateQueries({ queryKey: ["team-directory"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to reset seat access");
    }
  });

  const tasks = tasksQuery.data ?? [];
  const members = membersQuery.data ?? [];
  const seats = seatsQuery.data ?? [];
  const isCeo = meQuery.data?.role === "ceo";

  useEffect(() => {
    if (!selectedTaskId && tasks.length > 0) {
      setSelectedTaskId(tasks[0].id);
    }
  }, [selectedTaskId, tasks]);

  const openThreads = useMemo(
    () => tasks.filter((task) => task.status !== "completed" && task.status !== "cancelled"),
    [tasks]
  );
  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) ?? openThreads[0] ?? tasks[0] ?? null,
    [openThreads, selectedTaskId, tasks]
  );
  const memberMap = useMemo(
    () => new Map(members.map((member) => [member.id, member])),
    [members]
  );
  const filteredMembers = useMemo(() => {
    const query = memberSearch.trim().toLowerCase();
    if (!query) {
      return members;
    }
    return members.filter((member) =>
      `${member.full_name} ${member.email} ${member.role} ${member.department ?? ""}`.toLowerCase().includes(query)
    );
  }, [memberSearch, members]);
  const pendingSeats = useMemo(
    () => seats.filter((seat) => seat.activation_state !== "activated").slice(0, 6),
    [seats]
  );

  function copyToClipboard(value: string, label: string) {
    void navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  }

  return (
    <DashboardPageFrame
      eyebrow="Collaboration hub"
      title="Task and goal conversations"
      description="Keep execution threads, people context, and CEO-issued seat access in one shared workspace."
      actions={
        isCeo ? (
          <Button
            onClick={() => {
              const orgId = meQuery.data?.org_id;
              if (orgId) {
                window.location.href = `/api/onboarding/org/${orgId}/export-credentials`;
              }
            }}
          >
            <Download className="mr-2 h-4 w-4" />
            Export Access Sheet
          </Button>
        ) : undefined
      }
    >
      <div className="min-w-0 space-y-6">
      <div className="min-w-0 grid gap-4 md:grid-cols-4">
        <Card className="border border-border bg-bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-secondary">Active threads</p>
          <p className="mt-2 text-3xl font-bold text-text-primary">{openThreads.length}</p>
        </Card>
        <Card className="border border-border bg-bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-secondary">People in workspace</p>
          <p className="mt-2 text-3xl font-bold text-text-primary">{members.length}</p>
        </Card>
        <Card className="border border-border bg-bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-secondary">Comments in focus</p>
          <p className="mt-2 text-3xl font-bold text-text-primary">{commentsQuery.data?.length ?? 0}</p>
        </Card>
        <Card className="border border-border bg-bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-secondary">
            {isCeo ? "Pending seat activations" : "My role"}
          </p>
          <p className="mt-2 text-3xl font-bold capitalize text-text-primary">
            {isCeo ? pendingSeats.length : meQuery.data?.role ?? "member"}
          </p>
        </Card>
      </div>

      <div className="min-w-0 grid gap-6 xl:grid-cols-[minmax(0,260px)_minmax(0,1fr)] 2xl:grid-cols-[minmax(0,280px)_minmax(0,1fr)_minmax(0,340px)]">
        <Card className="border border-border bg-bg-surface p-0">
          <div className="border-b border-border px-4 py-3">
            <p className="text-sm font-semibold text-text-primary">Channels</p>
            <p className="text-xs text-text-secondary">Live task threads linked to goals and execution.</p>
          </div>
          <ScrollArea className="h-[56vh] xl:h-[720px]">
            <div className="space-y-2 p-3">
              {tasksQuery.isLoading ? (
                Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-16 w-full" />)
              ) : openThreads.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-5 text-center text-sm text-text-secondary">
                  No active task conversations yet.
                </div>
              ) : (
                openThreads.map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => setSelectedTaskId(task.id)}
                    className={`w-full rounded-xl border p-3 text-left transition ${
                      selectedTask?.id === task.id
                        ? "border-accent bg-accent/5"
                        : "border-border bg-bg-surface hover:border-text-secondary/30 hover:bg-bg-subtle"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Hash className="h-3.5 w-3.5 text-text-secondary" />
                          <p className="truncate text-sm font-medium text-text-primary">{task.title}</p>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-text-secondary">
                          {task.description ?? task.success_criteria}
                        </p>
                      </div>
                      <Badge className={statusTone(task.status)}>{task.status}</Badge>
                    </div>
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        </Card>

        <div className="min-w-0 space-y-4">
          <Card className="border border-border bg-bg-surface p-5">
            {selectedTask ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-secondary">Focused thread</p>
                    <h2 className="mt-1 text-2xl font-semibold text-text-primary">{selectedTask.title}</h2>
                    <p className="mt-2 text-sm text-text-secondary">
                      {selectedTask.description ?? selectedTask.success_criteria}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge className={statusTone(selectedTask.status)}>{selectedTask.status}</Badge>
                    <Badge variant="outline" className="border-border bg-bg-elevated text-text-secondary">
                      {selectedTask.priority ?? "medium"}
                    </Badge>
                    <Badge variant="outline" className="border-border bg-bg-elevated text-text-secondary">
                      Goal {selectedTask.goal_id.slice(0, 8)}
                    </Badge>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-border bg-bg-subtle p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-secondary">Assignee</p>
                    <p className="mt-1 text-sm text-text-primary">
                      {selectedTask.assigned_to ? memberMap.get(selectedTask.assigned_to)?.full_name ?? selectedTask.assigned_to : "Agent-owned or unassigned"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-bg-subtle p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-secondary">Due</p>
                    <p className="mt-1 text-sm text-text-primary">{selectedTask.deadline ? formatTimestamp(selectedTask.deadline) : "No deadline"}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-bg-subtle p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-secondary">Success criteria</p>
                    <p className="mt-1 text-sm text-text-primary">{selectedTask.success_criteria}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border p-8 text-center text-text-secondary">
                Select an active thread to start collaborating.
              </div>
            )}
          </Card>

          <Card className="border border-border bg-bg-surface p-0">
            <div className="border-b border-border px-5 py-3">
              <div className="flex items-center gap-2">
                <MessageSquareText className="h-4 w-4 text-text-secondary" />
                <p className="text-sm font-semibold text-text-primary">Conversation</p>
              </div>
              <p className="text-xs text-text-secondary">Use task comments as the shared thread for execution updates and goal alignment.</p>
            </div>

            <ScrollArea className="h-[34vh] xl:h-[420px]">
              <div className="space-y-3 px-5 py-4">
                {commentsQuery.isLoading && selectedTask ? (
                  Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-20 w-full" />)
                ) : (commentsQuery.data ?? []).length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-text-secondary">
                    No messages on this thread yet. Post the first execution update below.
                  </div>
                ) : (
                  (commentsQuery.data ?? []).map((comment) => {
                    const author = comment.author_id ? memberMap.get(comment.author_id) : null;
                    return (
                      <div key={comment.id} className="rounded-xl border border-border bg-bg-subtle p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-text-primary">{author?.full_name ?? "Team member"}</p>
                            <p className="text-xs text-text-secondary">
                              {author?.role?.toUpperCase() ?? "COMMENT"} {author?.department ? `· ${author.department}` : ""}
                            </p>
                          </div>
                          <p className="text-xs text-text-secondary">{formatTimestamp(comment.created_at)}</p>
                        </div>
                        <p className="mt-3 whitespace-pre-wrap text-sm text-text-primary">{comment.body}</p>
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>

            <Separator />

            <div className="space-y-3 p-5">
              <Textarea
                value={messageBody}
                onChange={(event) => setMessageBody(event.target.value)}
                placeholder={selectedTask ? "Share an update, unblock someone, or clarify the next move." : "Select a thread first."}
                className="min-h-[110px] border-border bg-bg-subtle"
                disabled={!selectedTask}
              />
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-text-secondary">
                  Messages are written into the task thread so the team sees the same execution record.
                </p>
                <Button
                  className="bg-accent hover:bg-accent-hover"
                  disabled={!selectedTask || messageBody.trim().length === 0 || postCommentMutation.isPending}
                  onClick={() => postCommentMutation.mutate()}
                >
                  <Send className="mr-2 h-4 w-4" />
                  {postCommentMutation.isPending ? "Sending..." : "Send update"}
                </Button>
              </div>
            </div>
          </Card>
        </div>

        <div className="min-w-0 space-y-4 xl:col-span-2 2xl:col-span-1">
          <Card className="border border-border bg-bg-surface p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-text-primary">People</p>
                <p className="text-xs text-text-secondary">Search contributors, roles, and departments in this workspace.</p>
              </div>
              <Users className="h-4 w-4 text-text-secondary" />
            </div>
            <Input
              value={memberSearch}
              onChange={(event) => setMemberSearch(event.target.value)}
              placeholder="Search people"
              className="mt-4 border-border bg-bg-subtle"
            />
            <div className="mt-4 space-y-2">
              {membersQuery.isLoading ? (
                Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-14 w-full" />)
              ) : filteredMembers.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-text-secondary">
                  No matching people found.
                </div>
              ) : (
                filteredMembers.slice(0, 10).map((member) => (
                  <div key={member.id} className="rounded-xl border border-border bg-bg-subtle p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-text-primary">{member.full_name}</p>
                        <p className="text-xs text-text-secondary">
                          {member.position_title ?? member.role.toUpperCase()}
                          {member.department ? ` · ${member.department}` : ""}
                        </p>
                      </div>
                      <Badge className={statusTone(member.status)}>{member.status ?? "active"}</Badge>
                    </div>
                    <p className="mt-2 text-xs text-text-secondary">{member.email}</p>
                  </div>
                ))
              )}
            </div>
          </Card>

          {isCeo ? (
            <Card className="border border-border bg-bg-surface p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-text-primary">CEO access console</p>
                  <p className="text-xs text-text-secondary">Approvals have been removed. Provision, reissue, and share seat access here.</p>
                </div>
                <ShieldCheck className="h-4 w-4 text-text-secondary" />
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-border bg-bg-subtle p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-secondary">Provisioned seats</p>
                  <p className="mt-2 text-2xl font-bold text-text-primary">{seats.length}</p>
                </div>
                <div className="rounded-xl border border-border bg-bg-subtle p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-secondary">Pending activation</p>
                  <p className="mt-2 text-2xl font-bold text-text-primary">{pendingSeats.length}</p>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {seatsQuery.isLoading ? (
                  Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-24 w-full" />)
                ) : pendingSeats.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-text-secondary">
                    All tracked seats are activated.
                  </div>
                ) : (
                  pendingSeats.map((seat) => (
                    <div key={seat.position_id} className="rounded-xl border border-border bg-bg-subtle p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium text-text-primary">{seat.position_title}</p>
                            <Badge className={statusTone(seat.activation_state)}>{seat.activation_state}</Badge>
                          </div>
                          <p className="mt-1 text-xs text-text-secondary">
                            {seat.department ?? "General"} · {seat.branch_name ?? "Main org"} · Level {seat.level}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-border"
                          onClick={() => resetAccessMutation.mutate(seat.position_id)}
                          disabled={resetAccessMutation.isPending}
                        >
                          <RefreshCw className="mr-2 h-4 w-4" />
                          Reissue
                        </Button>
                      </div>

                      <div className="mt-4 grid gap-3">
                        <div className="rounded-lg border border-border bg-bg-surface p-3">
                          <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
                            <Mail className="h-4 w-4" />
                            Login email
                          </div>
                          <p className="mt-2 font-mono text-xs text-text-secondary">{seat.email ?? "Not generated yet"}</p>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="rounded-lg border border-border bg-bg-surface p-3">
                            <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
                              <Link2 className="h-4 w-4" />
                              Invite
                            </div>
                            <p className="mt-2 font-mono text-xs text-text-secondary">{seat.invite_code ?? "Not issued"}</p>
                            {seat.invitation_url ? (
                              <Button size="sm" variant="ghost" className="mt-2 px-0" onClick={() => copyToClipboard(seat.invitation_url!, "Invite link")}>
                                Copy link
                              </Button>
                            ) : null}
                          </div>

                          <div className="rounded-lg border border-border bg-bg-surface p-3">
                            <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
                              <KeyRound className="h-4 w-4" />
                              Temporary password
                            </div>
                            <p className="mt-2 font-mono text-xs text-text-secondary">
                              {revealedPasswords[seat.position_id] ?? "Hidden until you reissue access"}
                            </p>
                            <p className="mt-1 text-[11px] text-text-secondary">
                              {seat.force_password_change ? "Password change required on first login." : "Password already rotated."}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>
          ) : (
            <Card className="border border-border bg-bg-surface p-4">
              <p className="text-sm font-semibold text-text-primary">Stay aligned</p>
              <p className="mt-1 text-sm text-text-secondary">
                Use task threads to coordinate handoffs, clarify blockers, and keep goal execution in one shared record.
              </p>
              <div className="mt-4 rounded-xl border border-border bg-bg-subtle p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-secondary">Next best action</p>
                <p className="mt-2 text-sm text-text-primary">
                  Open the most urgent thread, drop a concise update, and link any evidence or follow-up tasks directly inside that conversation.
                </p>
                <Button className="mt-4 bg-accent hover:bg-accent-hover" onClick={() => window.location.assign("/dashboard/task-board")}>
                  Open task board
                  <ArrowUpRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </Card>
          )}
        </div>
      </div>
      </div>
    </DashboardPageFrame>
  );
}
