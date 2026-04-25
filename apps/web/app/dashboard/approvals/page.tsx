"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { apiFetch } from "@/lib/api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import type { PendingMember } from "@/lib/models";

export default function ApprovalsPage() {
  const queryClient = useQueryClient();

  const pendingQuery = useQuery({
    queryKey: ["pending-members", "approvals"],
    queryFn: () => apiFetch<{ items: PendingMember[] }>("/api/orgs/pending-members"),
    select: (data) => data.items
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/orgs/members/${id}/approve`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pending-members"] })
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiFetch(`/api/orgs/members/${id}/reject`, { method: "POST", body: JSON.stringify({ reason }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pending-members"] })
  });

  if (pendingQuery.isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if ((pendingQuery.data ?? []).length === 0) {
    return (
      <div className="rounded-md border border-border bg-bg-surface p-8 text-center">
        <p className="text-sm text-text-secondary">No pending approvals — enjoy the peace</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-border bg-bg-surface">
      <Table>
        <TableHeader>
          <TableRow className="border-border hover:bg-transparent">
            <TableHead>Person</TableHead>
            <TableHead>Position</TableHead>
            <TableHead>Domain Match</TableHead>
            <TableHead>Applied</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(pendingQuery.data ?? []).map((member) => (
            <TableRow key={member.id} className="border-border">
              <TableCell>
                <p className="text-sm text-text-primary">{member.full_name}</p>
                <p className="text-xs text-text-secondary">{member.email}</p>
              </TableCell>
              <TableCell>
                <Badge className="bg-bg-subtle text-text-secondary">Requested</Badge>
              </TableCell>
              <TableCell>
                {member.email.includes("@") ? <Badge className="bg-success-subtle text-success">Match</Badge> : <Badge className="bg-danger-subtle text-danger">No match</Badge>}
              </TableCell>
              <TableCell>
                <span className="text-xs text-text-secondary">{formatDistanceToNow(new Date(member.created_at ?? new Date().toISOString()), { addSuffix: true })}</span>
              </TableCell>
              <TableCell>
                <div className="flex gap-2">
                  <Button size="sm" className="bg-success hover:bg-success" onClick={() => approveMutation.mutate(member.id)}>Accept</Button>
                  <Button size="sm" variant="outline" className="border-danger text-danger hover:bg-danger-subtle" onClick={() => rejectMutation.mutate({ id: member.id, reason: "Not aligned" })}>Reject</Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
