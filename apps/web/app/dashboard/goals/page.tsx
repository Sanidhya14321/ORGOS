"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import { getRoleFromBrowser } from "@/lib/auth";
import { GoalsTable } from "@/components/dashboard/goals-table";
import { Button } from "@/components/ui/button";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Stepper, { Step } from "@/components/ui/stepper";
import { 
  Plus, 
  Target, 
  TrendingUp, 
  AlertCircle, 
  Flag, 
  Calendar, 
  Tags,
  Sparkles,
  Check
} from "lucide-react";
import type { Goal, Task } from "@/lib/models";

export default function GoalsPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "critical">("medium");
  const [deadline, setDeadline] = useState("");

  // Data Fetching
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

  // Mutation with Optimistic Updates
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
      try {
        const msg = (_error as any)?.message || "Failed to create goal";
        toast.error(msg);
      } catch (e) {
        // ignore
      }
    },
    onSettled: () => {
      setOpen(false);
      setTitle("");
      setDescription("");
      setDeadline("");
      void queryClient.invalidateQueries({ queryKey: ["goals", "page"] });
      void queryClient.invalidateQueries({ queryKey: ["goals"] });
    }
  });

  const browserRole = typeof window !== "undefined" ? getRoleFromBrowser() : null;
  const canCreate = browserRole ? ["ceo", "cfo"].includes(browserRole.toLowerCase()) : false;

  // Executive Stats
  const stats = {
    total: goalsQuery.data?.length || 0,
    active: goalsQuery.data?.filter(g => g.status === "active").length || 0,
    atRisk: goalsQuery.data?.filter(g => g.sla_status === "at_risk" || g.sla_status === "breached").length || 0,
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-10">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-accent font-semibold text-sm uppercase tracking-wider">
            <Target className="h-4 w-4" />
            Strategy Management
          </div>
          <h1 className="text-4xl font-bold text-text-primary tracking-tight">Strategic Goals</h1>
          <p className="text-text-secondary max-w-lg">
            Monitor high-level objectives, manage autonomous decomposition, and track real-time SLA health across your organization.
          </p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            {canCreate ? (
              <Button size="lg" className="bg-accent hover:bg-accent/90 text-white shadow-lg shadow-accent/20 px-6">
                <Plus className="mr-2 h-5 w-5" />
                New Strategic Goal
              </Button>
            ) : (
              <Button size="lg" disabled className="bg-accent/10 text-text-secondary shadow-sm px-6" title="Insufficient role to create goals">
                <Plus className="mr-2 h-5 w-5" />
                New Strategic Goal
              </Button>
            )}
          </DialogTrigger>
          <DialogContent className="max-w-xl bg-bg-surface border-border p-0 overflow-hidden">
            <DialogHeader className="p-6 pb-2">
              <DialogTitle className="text-2xl font-bold flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-accent" />
                Define New Goal
              </DialogTitle>
              <DialogDescription>
                Break down your strategy into executable units of work.
              </DialogDescription>
            </DialogHeader>

            <div className="pb-4">
              <Stepper
                initialStep={1}
                onFinalStepCompleted={() => createMutation.mutate()}
                /* Overrides to fix overlap in image_2d4ae5.png */
                className="!min-h-0 !aspect-auto !p-0 !justify-start !items-stretch" 
                stepCircleContainerClassName="!border-none !shadow-none !bg-transparent !max-w-none !rounded-none"
                stepContainerClassName="px-8 pt-2 pb-8"
                contentClassName="px-0" 
                footerClassName="px-8 pb-4"
                nextButtonText="Next Step"
                backButtonText="Go Back"
                nextButtonProps={{
                  className: "bg-accent hover:bg-accent/90 text-white font-bold px-6 rounded-xl h-10 shadow-md transition-all active:scale-95 disabled:opacity-50",
                  disabled: createMutation.isPending || (title.length < 3)
                }}
                backButtonProps={{
                  className: "text-text-secondary hover:text-text-primary font-medium px-2"
                }}
                renderStepIndicator={({ step, currentStep }) => {
                    const isCompleted = currentStep > step;
                    const isActive = currentStep === step;
                    return (
                        <div className={`flex h-8 w-8 items-center justify-center rounded-full font-bold text-xs transition-all duration-300 border-2 
                            ${isActive ? 'bg-accent border-accent text-white scale-110 shadow-lg shadow-accent/20' : 
                              isCompleted ? 'bg-accent/20 border-accent/40 text-accent' : 
                              'bg-bg-subtle border-border text-text-secondary'}`}
                        >
                            {isCompleted ? <Check className="h-4 w-4" /> : step}
                        </div>
                    );
                }}
              >
                <Step>
                  <div className="space-y-5 px-8">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">Goal Identity</label>
                      <Input 
                        value={title} 
                        onChange={(e) => setTitle(e.target.value)} 
                        placeholder="e.g., Scale Cloud Infrastructure for Q4" 
                        className="h-12 border-border bg-bg-subtle text-base focus:ring-accent" 
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">Outcome Description</label>
                      <Textarea 
                        value={description} 
                        onChange={(e) => setDescription(e.target.value)} 
                        placeholder="Describe the successful state of this goal..." 
                        className="min-h-[120px] border-border bg-bg-subtle resize-none focus:ring-accent" 
                      />
                    </div>
                  </div>
                </Step>

                <Step>
                  <div className="space-y-6 px-8">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest flex items-center gap-2">
                        <Flag className="h-3 w-3" /> Priority Level
                      </label>
                      <Select value={priority} onValueChange={(v) => setPriority(v as any)}>
                        <SelectTrigger className="h-12 border-border bg-bg-subtle">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low Priority</SelectItem>
                          <SelectItem value="medium">Medium Priority</SelectItem>
                          <SelectItem value="high">High Priority</SelectItem>
                          <SelectItem value="critical">Critical / Blocker</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest flex items-center gap-2">
                        <Calendar className="h-3 w-3" /> Target Deadline (SLA)
                      </label>
                      <Input 
                        value={deadline} 
                        onChange={(e) => setDeadline(e.target.value)} 
                        type="date" 
                        className="h-12 border-border bg-bg-subtle focus:ring-accent" 
                      />
                    </div>
                  </div>
                </Step>

                <Step>
                  <div className="space-y-6 px-8">
                    <div className="p-5 rounded-2xl border border-dashed border-border bg-bg-subtle/50 space-y-4">
                      <div className="flex items-center gap-2 text-text-secondary">
                        <Tags className="h-4 w-4" />
                        <span className="text-[10px] font-bold uppercase tracking-widest">Metadata & Labels</span>
                      </div>
                      <Input placeholder="Engineering, Q3_Ops, Research..." className="bg-bg-surface border-border h-10" />
                      <div className="flex items-start gap-2 text-blue-500 bg-blue-500/5 p-3 rounded-lg border border-blue-500/10">
                        <TrendingUp className="h-4 w-4 mt-0.5 shrink-0" />
                        <p className="text-[11px] leading-relaxed">
                          Completing this goal will initiate <strong>Autonomous Decomposition</strong>. AI agents will begin drafting tasks to achieve this outcome.
                        </p>
                      </div>
                    </div>
                    
                    {createMutation.isPending && (
                        <div className="flex items-center justify-center gap-2 text-accent py-2 animate-pulse">
                            <Sparkles className="h-4 w-4" />
                            <span className="text-xs font-bold uppercase tracking-widest">Generating Tasks...</span>
                        </div>
                    )}
                  </div>
                </Step>
              </Stepper>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl border border-border bg-bg-surface flex items-center gap-4 shadow-sm hover:border-accent/30 transition-colors">
          <div className="h-12 w-12 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
            <Target className="h-6 w-6" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">Total Objectives</p>
            <p className="text-2xl font-bold text-text-primary tracking-tight">{stats.total}</p>
          </div>
        </div>
        <div className="p-4 rounded-2xl border border-border bg-bg-surface flex items-center gap-4 shadow-sm hover:border-green-500/30 transition-colors">
          <div className="h-12 w-12 rounded-xl bg-green-500/10 flex items-center justify-center text-green-500">
            <TrendingUp className="h-6 w-6" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">Active Focus</p>
            <p className="text-2xl font-bold text-text-primary tracking-tight">{stats.active}</p>
          </div>
        </div>
        <div className="p-4 rounded-2xl border border-border bg-bg-surface flex items-center gap-4 shadow-sm hover:border-red-500/30 transition-colors">
          <div className="h-12 w-12 rounded-xl bg-red-500/10 flex items-center justify-center text-red-500">
            <AlertCircle className="h-6 w-6" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">At Risk / Breached</p>
            <p className="text-2xl font-bold text-text-primary tracking-tight">{stats.atRisk}</p>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
        <GoalsTable 
          goals={goalsQuery.data ?? []} 
          tasks={tasksQuery.data ?? []} 
          loading={goalsQuery.isLoading || tasksQuery.isLoading} 
        />
      </div>
    </div>
  );
}