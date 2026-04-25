"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { GoalsTable } from "@/components/dashboard/goals-table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Goal, Task } from "@/lib/models";

export default function GoalsPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "critical">("medium");
  const [deadline, setDeadline] = useState("");

  const goalsQuery = useQuery({
    queryKey: ["goals", "page"],
    queryFn: () => apiFetch<{ items: Goal[] }>("/api/goals?limit=100"),
    select: (data) => data.items
  });

  const tasksQuery = useQuery({
    queryKey: ["tasks", "goals-page"],
    queryFn: () => apiFetch<{ items: Task[] }>("/api/tasks?limit=200"),
    select: (data) => data.items
  });

  const createMutation = useMutation({
    mutationFn: () =>
      apiFetch("/api/goals", {
        method: "POST",
        body: JSON.stringify({ title, description, raw_input: title, priority, deadline: deadline || undefined })
      }),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["goals", "page"] });
      const previous = queryClient.getQueryData<Goal[]>(["goals", "page"]);
      const optimistic: Goal = {
        id: `optimistic-${Date.now()}`,
        title,
        description,
        raw_input: title,
        status: "active",
        priority,
        simulation: false,
        deadline,
        task_count: 0
      };
      queryClient.setQueryData<Goal[]>(["goals", "page"], (old = []) => [optimistic, ...old]);
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["goals", "page"], context.previous);
      }
    },
    onSettled: () => {
      setOpen(false);
      setTitle("");
      setDescription("");
      setDeadline("");
      queryClient.invalidateQueries({ queryKey: ["goals"] });
    }
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-text-primary">Goals</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-accent hover:bg-accent-hover">Create Goal</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Goal</DialogTitle>
              <DialogDescription>Add a new strategic goal and start decomposition.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Goal title" className="border-border bg-bg-subtle" />
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" className="border-border bg-bg-subtle" />
              <Select value={priority} onValueChange={(v) => setPriority(v as "low" | "medium" | "high" | "critical")}>
                <SelectTrigger className="border-border bg-bg-subtle"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
              <Input value={deadline} onChange={(e) => setDeadline(e.target.value)} type="date" className="border-border bg-bg-subtle" />
              <Button className="w-full bg-accent hover:bg-accent-hover" disabled={createMutation.isPending || title.trim().length < 3} onClick={() => createMutation.mutate()}>
                {createMutation.isPending ? "Creating..." : "Create"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <GoalsTable goals={goalsQuery.data ?? []} tasks={tasksQuery.data ?? []} loading={goalsQuery.isLoading || tasksQuery.isLoading} />
    </div>
  );
}
