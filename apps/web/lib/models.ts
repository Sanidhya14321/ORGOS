export type Role = "ceo" | "cfo" | "manager" | "worker";

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  status?: "pending" | "active" | "rejected";
  org_id?: string | null;
  position_id?: string | null;
  reports_to?: string | null;
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
  completion_pct?: number;
  blocked_count?: number;
  contributors?: Array<{ id: string; full_name: string }>;
  sla_status?: "on_track" | "at_risk" | "breached";
}

export type TaskStatus = "pending" | "routing" | "active" | "in_progress" | "blocked" | "rejected" | "completed" | "cancelled";

export interface Task {
  id: string;
  org_id?: string;
  created_by?: string | null;
  owner_id?: string | null;
  goal_id: string;
  parent_id: string | null;
  parent_task_id?: string | null;
  depth: 0 | 1 | 2;
  title: string;
  description?: string;
  success_criteria: string;
  priority?: GoalPriority;
  assigned_to: string | null;
  assignees?: string[];
  watchers?: string[];
  depends_on?: string[];
  assigned_role: Role;
  is_agent_task: boolean;
  routing_confirmed?: boolean;
  status: TaskStatus;
  deadline?: string;
  sla_deadline?: string;
  sla_status?: "on_track" | "at_risk" | "breached";
  recurrence_cron?: string | null;
  recurrence_enabled?: boolean;
  recurrence_timezone?: string;
  next_run_at?: string | null;
  requires_evidence?: boolean;
  completion_approved?: boolean;
  blocked_by_count?: number;
  estimated_effort_hours?: number;
  is_overdue?: boolean;
  created_at?: string;
  updated_at?: string;
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

export interface PendingMember {
  id: string;
  email: string;
  full_name: string;
  position_id?: string | null;
  reports_to?: string | null;
  status: "pending";
  created_at?: string;
}

export type JobStatus = "open" | "paused" | "closed";
export type ApplicantStage = "applied" | "screening" | "interview" | "offer" | "hired" | "rejected";

export interface Job {
  id: string;
  org_id: string;
  title: string;
  department: string;
  description: string;
  required_skills: string[];
  experience_years?: number;
  employment_type?: string;
  location?: string;
  salary_min?: number;
  salary_max?: number;
  status: JobStatus;
  closes_at?: string;
}

export interface Applicant {
  id: string;
  job_id: string;
  org_id: string;
  full_name: string;
  email: string;
  phone?: string;
  source: "direct" | "referral" | "linkedin" | "job_board";
  stage: ApplicantStage;
  ai_score?: number;
  ai_summary?: string;
  applied_at: string;
}
