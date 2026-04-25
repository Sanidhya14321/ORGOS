"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { Goal, PendingMember, Role, Task, User } from "@/lib/models";

export function useMeQuery() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => apiFetch<User>("/api/me")
  });
}

export function useTasksQuery(limit = 100) {
  return useQuery({
    queryKey: ["tasks", limit],
    queryFn: () => apiFetch<{ items: Task[] }>(`/api/tasks?limit=${limit}`),
    select: (data) => data.items,
    placeholderData: (prev) => prev
  });
}

export function useGoalsQuery(enabled: boolean, params?: { page?: number; limit?: number }) {
  const page = params?.page ?? 1;
  const limit = params?.limit ?? 20;
  return useQuery({
    queryKey: ["goals", page, limit],
    queryFn: () => apiFetch<{ items: Goal[] }>(`/api/goals?page=${page}&limit=${limit}`),
    select: (data) => data.items,
    enabled,
    placeholderData: (prev) => prev
  });
}

export function usePendingMembersQuery(role?: Role) {
  return useQuery({
    queryKey: ["pending-members"],
    queryFn: () => apiFetch<{ items: PendingMember[] }>("/api/orgs/pending-members"),
    select: (data) => data.items,
    enabled: role === "ceo" || role === "cfo"
  });
}

export function useOrgAccountsQuery(orgId?: string, role?: Role) {
  return useQuery({
    queryKey: ["org-accounts", orgId],
    queryFn: () => apiFetch<{ items: User[] }>(`/api/orgs/${orgId}/accounts`),
    select: (data) => data.items,
    enabled: Boolean(orgId) && (role === "ceo" || role === "cfo")
  });
}
