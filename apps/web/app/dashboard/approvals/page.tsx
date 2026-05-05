"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { apiFetch } from "@/lib/api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import type { PendingMember } from "@/lib/models";

interface Position {
  id: string;
  name: string;
  level: number;
  department?: string;
}

interface UserProfile {
  id: string;
  org_id: string;
  full_name: string;
  email: string;
}

export default function ApprovalsPage() {
  const queryClient = useQueryClient();

  // Fetch user profile to get org_id
  const userQuery = useQuery<UserProfile>({
    queryKey: ["me"],
    queryFn: () => apiFetch<UserProfile>("/api/me")
  });

  const pendingQuery = useQuery({
    queryKey: ["pending-members", "approvals"],
    queryFn: () => apiFetch<{ items: PendingMember[] }>("/api/orgs/pending-members"),
    select: (data) => data.items
  });

  const positionsQuery = useQuery({
    queryKey: ["positions", userQuery.data?.org_id],
    queryFn: () => apiFetch<{ positions: Position[] }>(`/api/orgs/${userQuery.data?.org_id}/positions`),
    select: (data) => data.positions ?? [],
    enabled: !!userQuery.data?.org_id
  });

  const usersQuery = useQuery({
    queryKey: ["users", "all", userQuery.data?.org_id],
    queryFn: () => apiFetch<{ items: Array<{ id: string; full_name: string; email: string; position_id?: string }> }>(`/api/orgs/${userQuery.data?.org_id}/accounts`),
    select: (data) => data.items ?? [],
    enabled: !!userQuery.data?.org_id
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

  if (userQuery.isLoading || pendingQuery.isLoading || positionsQuery.isLoading || usersQuery.isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  const getUsersInPosition = (posId: string) => {
    return usersQuery.data?.filter(u => u.position_id === posId) ?? [];
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-10">
      {/* Pending Approvals Section */}
      <div className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold text-text-primary">Pending Approvals</h2>
          <p className="text-sm text-text-secondary">Review and approve new team members</p>
        </div>
        {(pendingQuery.data ?? []).length === 0 ? (
          <div className="rounded-md border border-border bg-bg-surface p-8 text-center">
            <p className="text-sm text-text-secondary">No pending approvals — enjoy the peace</p>
          </div>
        ) : (
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
        )}
      </div>

      {/* Positions & Members Section */}
      <div className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold text-text-primary">Organization Positions</h2>
          <p className="text-sm text-text-secondary">View all positions and their members</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {(positionsQuery.data ?? []).map((position) => {
            const members = getUsersInPosition(position.id);
            return (
              <div key={position.id} className="rounded-md border border-border bg-bg-surface p-4">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-text-primary">{position.name}</h3>
                    {position.department && <p className="text-xs text-text-secondary">{position.department}</p>}
                  </div>
                  <Badge className="bg-accent/10 text-accent">Level {position.level}</Badge>
                </div>
                <div className="space-y-2">
                  {members.length === 0 ? (
                    <p className="text-xs text-text-secondary italic py-2">No members assigned</p>
                  ) : (
                    <div className="space-y-2">
                      {members.map((member) => (
                        <div key={member.id} className="flex items-center justify-between bg-bg-subtle rounded p-2">
                          <div>
                            <p className="text-xs font-medium text-text-primary">{member.full_name}</p>
                            <p className="text-[10px] text-text-secondary">{member.email}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
