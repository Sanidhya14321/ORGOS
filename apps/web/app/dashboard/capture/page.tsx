"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

      if (parsed.kind === "goal") {
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
      <Card className="space-y-4 border border-border bg-bg-surface p-4">
        <Textarea value={rawText} onChange={(event) => setRawText(event.target.value)} className="min-h-36 border-border bg-bg-subtle" placeholder="Describe the work in natural language" />
        <div className="grid gap-3 md:grid-cols-2">
          <Input value={deadline} onChange={(event) => setDeadline(event.target.value)} type="date" className="border-border bg-bg-subtle" />
          <Select value={goalId} onValueChange={setGoalId} disabled={!goalsQuery.data?.length}>
            <SelectTrigger className="border-border bg-bg-subtle">
              <SelectValue placeholder="Choose a goal for tasks" />
            </SelectTrigger>
            <SelectContent>
              {(goalsQuery.data ?? []).map((goal) => (
                <SelectItem key={goal.id} value={goal.id}>{goal.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-3">
          <Button onClick={() => parseMutation.mutate()} disabled={parseMutation.isPending || rawText.trim().length === 0}>Parse input</Button>
          <Button variant="outline" className="border-border" onClick={() => createMutation.mutate()} disabled={!parsed || createMutation.isPending}>
            {createMutation.isPending ? "Creating..." : "Create work item"}
          </Button>
        </div>
        {parsed ? (
          <div className="rounded-lg border border-border bg-bg-elevated p-4 text-sm text-text-secondary">
            <p className="font-medium text-text-primary">{parsed.kind.toUpperCase()} - {parsed.title}</p>
            <p className="mt-1">Priority: {parsed.priority}</p>
            <p className="mt-1">{parsed.description}</p>
          </div>
        ) : null}
      </Card>
    </AppShell>
  );
}