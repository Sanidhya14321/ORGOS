"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { canAccessSection, canManageGoals } from "@/lib/access";
import type { Goal, Role } from "@/lib/models";

type ParsedInput = {
  kind: "goal" | "task" | "meeting" | "note";
  title: string;
  description?: string;
  priority: "low" | "medium" | "high" | "critical";
};

type MeResponse = { role: Role; org_id?: string | null };

export default function CapturePage() {
  const queryClient = useQueryClient();
  const [rawText, setRawText] = useState("Ship a customer onboarding revamp next quarter with clear milestones.");
  const [parsed, setParsed] = useState<ParsedInput | null>(null);
  const [goalId, setGoalId] = useState<string>("");
  const [deadline, setDeadline] = useState("");

  const meQuery = useQuery({
    queryKey: ["me", "capture"],
    queryFn: () => apiFetch<MeResponse>("/api/me")
  });

  const goalsQuery = useQuery({
    queryKey: ["capture-goals"],
    queryFn: () => apiFetch<{ items: Goal[] }>("/api/goals?limit=20"),
    select: (data) => data.items,
    enabled: meQuery.data?.role === "ceo" || meQuery.data?.role === "cfo" || meQuery.data?.role === "manager"
  });

  useEffect(() => {
    if (!goalId && goalsQuery.data?.[0]?.id) {
      setGoalId(goalsQuery.data[0].id);
    }
  }, [goalId, goalsQuery.data]);

  const parseMutation = useMutation({
    mutationFn: () => apiFetch<ParsedInput>("/api/ai/parse-input", { method: "POST", body: JSON.stringify({ text: rawText }) }),
    onSuccess: (value) => setParsed(value)
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!parsed) {
        throw new Error("Parse input first");
      }

      if (!canAccessSection(meQuery.data?.role, "capture")) {
        throw new Error("You do not have access to smart input for this role");
      }

      if (parsed.kind === "goal") {
        if (!canManageGoals(meQuery.data?.role)) {
          throw new Error("Only CEO and CFO can create goals");
        }
        return apiFetch("/api/goals", {
          method: "POST",
          body: JSON.stringify({
            title: parsed.title,
            description: parsed.description ?? rawText,
            raw_input: rawText,
            priority: parsed.priority,
            deadline: deadline || undefined,
            simulation: false
          })
        });
      }

      if (!goalId) {
        throw new Error("Select a goal before creating a task");
      }

      return apiFetch("/api/tasks", {
        method: "POST",
        body: JSON.stringify({
          goalId,
          title: parsed.title,
          description: parsed.description ?? rawText,
          successCriteria: parsed.description ?? rawText,
          assignedRole: meQuery.data?.role ?? "worker",
          priority: parsed.priority,
          depth: 0,
          deadline: deadline || undefined,
          recurrenceEnabled: false,
          recurrenceTimezone: "UTC",
          requiresEvidence: false
        })
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["goals"] });
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
      setParsed(null);
      setRawText("");
    }
  });

  return (
    <AppShell
      eyebrow="Smart Input"
      title="Turn plain language into work"
      description="Draft a goal, task, or meeting note from one short instruction."
      role={meQuery.data?.role}
    >
      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="space-y-5 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <Badge variant="outline" className="border-border bg-bg-elevated text-text-secondary">
                Capture pipeline
              </Badge>
              <p className="max-w-2xl text-sm leading-7 text-text-secondary">
                Write the intent in natural language, parse it into structure, then convert it into a goal or task
                without leaving the dashboard.
              </p>
            </div>
            <div className="rounded-[22px] border border-border bg-bg-elevated px-4 py-3">
              <p className="dashboard-label">Role access</p>
              <p className="mt-2 text-sm font-medium text-text-primary">
                {canAccessSection(meQuery.data?.role, "capture") ? "Enabled for your role" : "Restricted"}
              </p>
            </div>
          </div>

        {!canAccessSection(meQuery.data?.role, "capture") ? (
          <div className="rounded-2xl border border-border bg-bg-elevated p-4 text-sm text-text-secondary">
            Smart input is available for CEO, CFO, and manager roles.
          </div>
        ) : null}
          <div className="space-y-2">
            <p className="dashboard-label">Raw instruction</p>
            <Textarea
              value={rawText}
              onChange={(event) => setRawText(event.target.value)}
              className="min-h-44"
              placeholder="Describe the work in natural language"
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Input value={deadline} onChange={(event) => setDeadline(event.target.value)} type="date" />
          <Select value={goalId} onValueChange={setGoalId} disabled={!goalsQuery.data?.length}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a goal for tasks" />
            </SelectTrigger>
            <SelectContent>
              {(goalsQuery.data ?? []).map((goal) => (
                <SelectItem key={goal.id} value={goal.id}>{goal.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => parseMutation.mutate()} disabled={!canAccessSection(meQuery.data?.role, "capture") || parseMutation.isPending || rawText.trim().length === 0}>
              {parseMutation.isPending ? "Parsing..." : "Parse input"}
            </Button>
            <Button variant="outline" onClick={() => createMutation.mutate()} disabled={!canAccessSection(meQuery.data?.role, "capture") || !parsed || createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : "Create work item"}
            </Button>
          </div>
        </Card>

        <div className="grid gap-4">
          <Card className="p-5">
            <p className="dashboard-label">Suggested structure</p>
            {parsed ? (
              <div className="mt-4 space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{parsed.kind}</Badge>
                  <Badge variant="outline">Priority {parsed.priority}</Badge>
                  {deadline ? <Badge variant="outline">Deadline set</Badge> : null}
                </div>
                <div>
                  <p className="text-lg font-semibold text-text-primary">{parsed.title}</p>
                  <p className="mt-2 text-sm leading-7 text-text-secondary">{parsed.description ?? rawText}</p>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-border bg-bg-elevated p-6 text-sm leading-7 text-text-secondary">
                Parse the raw instruction to preview the structured goal or task before creating it.
              </div>
            )}
          </Card>

          <Card className="p-5">
            <p className="dashboard-label">Capture notes</p>
            <div className="mt-4 space-y-4 text-sm leading-6 text-text-secondary">
              <div>
                <p className="font-semibold text-text-primary">Goals</p>
                <p>Use broader strategic language when you want ORGOS to create a top-level initiative.</p>
              </div>
              <div>
                <p className="font-semibold text-text-primary">Tasks</p>
                <p>Attach a task to a goal whenever the request belongs to an existing initiative.</p>
              </div>
              <div>
                <p className="font-semibold text-text-primary">Deadlines</p>
                <p>Optional dates help the created item land with better urgency and SLA context.</p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}