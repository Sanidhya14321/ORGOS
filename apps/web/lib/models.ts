export type Role = "ceo" | "cfo" | "manager" | "worker";

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  department?: string;
  skills?: string[];
  open_task_count?: number;
}

export type GoalStatus = "active" | "paused" | "completed" | "cancelled";
export type GoalPriority = "low" | "medium" | "high" | "critical";

export interface Goal {
  id: string;
  title: string;
  description?: string;
  raw_input: string;
  status: GoalStatus;
  priority: GoalPriority;
  kpi?: string;
  deadline?: string;
  simulation: boolean;
  task_count?: number;
}

export type TaskStatus = "pending" | "in_progress" | "blocked" | "completed" | "cancelled";

export interface Task {
  id: string;
  goal_id: string;
  parent_id: string | null;
  depth: 0 | 1 | 2;
  title: string;
  description?: string;
  success_criteria: string;
  assigned_to: string | null;
  assigned_role: Role;
  is_agent_task: boolean;
  status: TaskStatus;
  deadline?: string;
  report_id?: string | null;
}

export interface Report {
  id: string;
  task_id: string;
  submitted_by?: string;
  is_agent: boolean;
  status: "completed" | "partial" | "blocked";
  insight: string;
  data: Record<string, unknown>;
  confidence: number;
  sources?: Array<{ url: string; title: string; accessed: string }>;
  escalate: boolean;
}

export interface AgentLog {
  id: string;
  agent_type: string;
  action: string;
  model: string;
  latency_ms?: number;
  prompt_tokens?: number;
  comp_tokens?: number;
  error?: string | null;
  created_at?: string;
}
