'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DashboardPageFrame } from '@/components/dashboard/dashboard-surface';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch } from '@/lib/api';
import { canManageGoals } from '@/lib/access';
import { 
  Target, Plus, ChevronRight, ChevronDown, AlertCircle, CheckCircle2, Clock, 
  Zap, MoreVertical, Trash2, Edit, TrendingUp
} from 'lucide-react';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';

interface Task {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'blocked' | 'completed' | 'cancelled';
  assigned_to?: string;
  assigned_role: string;
  depth: number;
  parent_id?: string | null;
  success_criteria: string;
  deadline?: string | null;
  is_agent_task: boolean;
}

interface Goal {
  id: string;
  title: string;
  description?: string;
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'critical';
  kpi?: string;
  deadline?: string;
  created_at: string;
  updated_at: string;
  tasks?: Task[];
  task_count: number;
  completed_count: number;
}

type GoalTaskNode = {
  task: Task;
  children: GoalTaskNode[];
};

type GoalDetail = Omit<Goal, 'tasks'> & {
  tasks?: GoalTaskNode[];
};

type MeResponse = {
  role: 'ceo' | 'cfo' | 'manager' | 'worker';
};

const priorityColors: Record<string, string> = {
  low: 'bg-info-subtle text-info border border-info/20',
  medium: 'bg-warning-subtle text-warning border border-warning/20',
  high: 'bg-warning-subtle text-warning border border-warning/20',
  critical: 'bg-danger-subtle text-danger border border-danger/20'
};

const statusIcons: Record<string, React.ReactNode> = {
  pending: <Clock className="h-4 w-4" />,
  in_progress: <Zap className="h-4 w-4" />,
  blocked: <AlertCircle className="h-4 w-4" />,
  completed: <CheckCircle2 className="h-4 w-4" />,
  cancelled: <Trash2 className="h-4 w-4" />
};

const statusColors: Record<string, string> = {
  pending: 'bg-bg-elevated text-text-secondary',
  in_progress: 'bg-info-subtle text-info',
  blocked: 'bg-danger-subtle text-danger',
  completed: 'bg-success-subtle text-success',
  cancelled: 'bg-bg-elevated text-text-muted'
};

function TaskTree({ tasks }: { tasks: Task[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpand = (taskId: string) => {
    const newExpanded = new Set(expanded);
    if (newExpanded.has(taskId)) {
      newExpanded.delete(taskId);
    } else {
      newExpanded.add(taskId);
    }
    setExpanded(newExpanded);
  };

  const rootTasks = tasks.filter((task) => !task.parent_id);

  const renderTask = (task: Task) => {
    const children = tasks.filter(t => t.parent_id === task.id);
    const hasChildren = children.length > 0;

    return (
      <div key={task.id} className="border-l-2 border-border">
        <div className="pl-4 py-3 hover:bg-bg-elevated transition-colors flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {hasChildren && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => toggleExpand(task.id)}
                >
                  {expanded.has(task.id) ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </Button>
              )}
              {!hasChildren && <div className="w-6" />}

              <span className={`text-xs font-medium ${statusColors[task.status]}`}>
                {statusIcons[task.status]}
              </span>
              <span className="text-sm font-medium text-text-primary">{task.title}</span>
              {task.is_agent_task && (
                <Badge className="bg-accent-subtle text-accent border border-accent/20 text-xs">AI</Badge>
              )}
            </div>

            {task.success_criteria && (
              <p className="text-xs text-text-secondary mt-1 ml-8">✓ {task.success_criteria}</p>
            )}
          </div>

          <Badge className={`text-xs ${statusColors[task.status]}`}>
            {task.status.replace('_', ' ')}
          </Badge>
        </div>

        {hasChildren && expanded.has(task.id) && (
          <div className="space-y-0 ml-4">
            {children.map(child => renderTask(child))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-2 border border-border rounded-lg bg-bg-surface">
      {rootTasks.length > 0 ? (
        rootTasks.map(task => renderTask(task))
      ) : (
        <div className="p-4 text-center text-text-secondary">
          <p className="text-sm">No tasks yet. AI will decompose this goal into tasks.</p>
        </div>
      )}
    </div>
  );
}

function flattenTaskNodes(nodes: GoalTaskNode[], parentId: string | null = null): Task[] {
  return nodes.flatMap((node) => {
    const task = {
      ...node.task,
      parent_id: parentId,
      depth: typeof node.task.depth === 'number' ? node.task.depth : parentId ? 1 : 0
    };
    return [task, ...flattenTaskNodes(node.children ?? [], task.id)];
  });
}

export default function GoalsPage() {
  const [selectedGoal, setSelectedGoal] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [goalTitle, setGoalTitle] = useState('');
  const [goalDescription, setGoalDescription] = useState('');
  const [goalDeadline, setGoalDeadline] = useState('');
  const [goalPriority, setGoalPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'completed'>('active');

  const queryClient = useQueryClient();
  const meQuery = useQuery({
    queryKey: ['me', 'goals-page'],
    queryFn: () => apiFetch<MeResponse>('/api/me')
  });
  const canEditGoals = canManageGoals(meQuery.data?.role);

  // Fetch goals
  const goalsQuery = useQuery({
    queryKey: ['goals', statusFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') {
        params.append('status', statusFilter);
      }
      return apiFetch<{ items: Goal[] }>(`/api/goals?${params}`);
    },
    select: (data) => data.items || []
  });

  useEffect(() => {
    if (!selectedGoal && goalsQuery.data && goalsQuery.data.length > 0) {
      setSelectedGoal(goalsQuery.data[0].id);
    }
  }, [goalsQuery.data, selectedGoal]);

  const goalDetailQuery = useQuery({
    queryKey: ['goal-detail', selectedGoal],
    queryFn: () => apiFetch<GoalDetail>(`/api/goals/${selectedGoal}`),
    enabled: Boolean(selectedGoal),
    refetchInterval: (query) => {
      const goal = query.state.data as GoalDetail | undefined;
      return goal && Array.isArray(goal.tasks) && goal.tasks.length > 0 ? false : 5000;
    }
  });

  // Create goal mutation
  const createGoalMutation = useMutation({
    mutationFn: (payload: {
      title: string;
      description?: string;
      deadline?: string;
      priority: 'low' | 'medium' | 'high' | 'critical';
    }) =>
      apiFetch<{ id: string }>('/api/goals', {
        method: 'POST',
        body: JSON.stringify(payload)
      }),
    onSuccess: () => {
      toast.success('Goal created! AI is decomposing it into tasks.');
      void queryClient.invalidateQueries({ queryKey: ['goals'] });
      void queryClient.invalidateQueries({ queryKey: ['goal-detail'] });
      setCreateOpen(false);
      setGoalTitle('');
      setGoalDescription('');
      setGoalDeadline('');
      setGoalPriority('medium');
    },
    onError: (err) => {
      const msg = (err as any)?.message || 'Failed to create goal';
      toast.error(msg);
    }
  });

  // Delete goal mutation
  const deleteGoalMutation = useMutation({
    mutationFn: (goalId: string) =>
      apiFetch(`/api/goals/${goalId}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Goal deleted');
      void queryClient.invalidateQueries({ queryKey: ['goals'] });
      void queryClient.invalidateQueries({ queryKey: ['goal-detail'] });
      setSelectedGoal(null);
    },
    onError: (err) => {
      const msg = (err as any)?.message || 'Failed to delete goal';
      toast.error(msg);
    }
  });

  const selectedGoalSummary = goalsQuery.data?.find(g => g.id === selectedGoal) ?? null;
  const flattenedGoalTasks = flattenTaskNodes(goalDetailQuery.data?.tasks ?? []);
  const derivedCompletedCount = flattenedGoalTasks.filter((task) => task.status === 'completed').length;
  const selectedGoalData = goalDetailQuery.data
    ? {
        ...selectedGoalSummary,
        ...goalDetailQuery.data,
        task_count: selectedGoalSummary?.task_count ?? flattenedGoalTasks.length,
        completed_count: selectedGoalSummary?.completed_count ?? derivedCompletedCount,
        tasks: flattenedGoalTasks
      }
    : selectedGoalSummary;

  const handleCreateGoal = () => {
    if (!goalTitle.trim()) {
      toast.error('Goal title is required');
      return;
    }

    createGoalMutation.mutate({
      title: goalTitle,
      description: goalDescription || undefined,
      deadline: goalDeadline || undefined,
      priority: goalPriority
    });
  };

  return (
    <DashboardPageFrame
      eyebrow="Goals"
      title="Strategic objectives"
      description="Create, monitor, and inspect goals with AI-decomposed task trees and execution progress."
      actions={
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button disabled={!canEditGoals}>
              <Plus className="mr-2 h-4 w-4" />
              New Goal
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Goal</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-text-primary">Goal Title *</label>
                <input
                  type="text"
                  placeholder="e.g., Launch new product feature"
                  value={goalTitle}
                  onChange={(e) => setGoalTitle(e.target.value)}
                  className="mt-1 w-full px-3 py-2 border border-border rounded-md bg-bg-surface text-text-primary placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-text-primary">Description</label>
                <textarea
                  placeholder="Optional description and context..."
                  value={goalDescription}
                  onChange={(e) => setGoalDescription(e.target.value)}
                  className="mt-1 w-full px-3 py-2 border border-border rounded-md bg-bg-surface text-text-primary placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-accent"
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-text-primary">Priority</label>
                  <select
                    value={goalPriority}
                    onChange={(e) => setGoalPriority(e.target.value as any)}
                    className="mt-1 w-full px-3 py-2 border border-border rounded-md bg-bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium text-text-primary">Deadline</label>
                  <input
                    type="date"
                    value={goalDeadline}
                    onChange={(e) => setGoalDeadline(e.target.value)}
                    className="mt-1 w-full px-3 py-2 border border-border rounded-md bg-bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setCreateOpen(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCreateGoal}
                  disabled={!canEditGoals || createGoalMutation.isPending}
                  className="flex-1 bg-accent hover:bg-accent-hover"
                >
                  {createGoalMutation.isPending ? 'Creating...' : 'Create Goal'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      }
    >
      <div className="space-y-6">

      {/* Filters */}
      <div className="flex gap-2">
        {(['all', 'active', 'completed'] as const).map((status) => (
          <Button
            key={status}
            variant={statusFilter === status ? 'default' : 'outline'}
            onClick={() => setStatusFilter(status)}
            className={statusFilter === status ? 'bg-accent text-white' : ''}
          >
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </Button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Goals List */}
        <div className="lg:col-span-1 space-y-3">
          <h2 className="font-semibold text-text-primary">Goals ({goalsQuery.data?.length || 0})</h2>

          {goalsQuery.isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : goalsQuery.data && goalsQuery.data.length > 0 ? (
            <div className="space-y-2">
              {goalsQuery.data.map((goal) => (
                <Card
                  key={goal.id}
                  className={`p-3 cursor-pointer border transition-colors ${
                    selectedGoal === goal.id
                      ? 'border-accent bg-accent-subtle'
                      : 'border-border hover:bg-bg-elevated'
                  }`}
                  onClick={() => setSelectedGoal(goal.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm text-text-primary truncate">{goal.title}</h3>
                      <div className="mt-1 flex gap-1 flex-wrap">
                        <Badge className={`text-xs ${priorityColors[goal.priority]}`}>
                          {goal.priority}
                        </Badge>
                        <Badge className="text-xs bg-bg-subtle text-text-secondary">
                          {goal.completed_count}/{goal.task_count} tasks
                        </Badge>
                      </div>
                    </div>

                    {canEditGoals ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="border-border bg-bg-surface">
                          <DropdownMenuItem className="text-text-primary hover:bg-bg-elevated cursor-pointer">
                            <Edit className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="cursor-pointer text-danger focus:bg-danger-subtle"
                            onClick={() => deleteGoalMutation.mutate(goal.id)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="p-6 text-center border-border bg-bg-surface">
              <Target className="mx-auto mb-2 h-6 w-6 text-text-secondary" />
              <p className="text-sm text-text-secondary">No {statusFilter !== 'all' ? statusFilter : ''} goals</p>
            </Card>
          )}
        </div>

        {/* Goal Detail */}
        <div className="lg:col-span-2">
          {selectedGoalData ? (
            <div className="space-y-4">
              <Card className="border-border bg-bg-surface p-6">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <h2 className="text-2xl font-bold text-text-primary">{selectedGoalData.title}</h2>
                    {selectedGoalData.description && (
                      <p className="mt-2 text-text-secondary">{selectedGoalData.description}</p>
                    )}
                  </div>
                  <Badge className={`${priorityColors[selectedGoalData.priority]}`}>
                    {selectedGoalData.priority}
                  </Badge>
                </div>

                <div className="grid gap-3 text-sm">
                  {selectedGoalData.kpi && (
                    <div>
                      <span className="text-text-secondary">KPI:</span>
                      <p className="text-text-primary font-medium">{selectedGoalData.kpi}</p>
                    </div>
                  )}
                  {selectedGoalData.deadline && (
                    <div>
                      <span className="text-text-secondary">Deadline:</span>
                      <p className="text-text-primary font-medium">
                        {new Date(selectedGoalData.deadline).toLocaleDateString()}
                      </p>
                    </div>
                  )}
                  <div>
                    <span className="text-text-secondary">Progress:</span>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="flex-1 bg-bg-subtle rounded-full h-2">
                        <div
                          className="bg-success h-2 rounded-full transition-all"
                          style={{
                            width: `${selectedGoalData.task_count > 0 ? (selectedGoalData.completed_count / selectedGoalData.task_count) * 100 : 0}%`
                          }}
                        />
                      </div>
                      <span className="text-xs font-medium">
                        {selectedGoalData.completed_count}/{selectedGoalData.task_count}
                      </span>
                    </div>
                  </div>
                </div>
              </Card>

              <div>
                <h3 className="font-semibold text-text-primary mb-3">Task Breakdown</h3>
                {goalDetailQuery.isLoading && selectedGoal ? (
                  <Card className="border-border bg-bg-surface p-6 text-center">
                    <TrendingUp className="mx-auto mb-2 h-6 w-6 animate-pulse text-text-secondary" />
                    <p className="text-sm text-text-secondary">Loading saved task breakdown...</p>
                  </Card>
                ) : selectedGoalData?.tasks && selectedGoalData.tasks.length > 0 ? (
                  <TaskTree tasks={selectedGoalData.tasks} />
                ) : (
                  <Card className="border-border bg-bg-surface p-6 text-center">
                    <TrendingUp className="mx-auto mb-2 h-6 w-6 text-text-secondary" />
                    <p className="text-sm text-text-secondary">
                      {selectedGoal
                        ? 'AI is decomposing this goal into tasks and saving them to the database...'
                        : 'Select a goal to view its saved task breakdown.'}
                    </p>
                  </Card>
                )}
              </div>
            </div>
          ) : (
            <Card className="border-border bg-bg-surface p-12 text-center">
              <Target className="mx-auto mb-3 h-8 w-8 text-text-secondary" />
              <p className="text-text-secondary">Select a goal to view tasks and progress</p>
            </Card>
          )}
        </div>
      </div>
      </div>
    </DashboardPageFrame>
  );
}
