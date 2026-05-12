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
  description_ciphertext?: string | null;
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
  description_ciphertext?: string | null;
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
  estimated_hours?: number;
  actual_hours?: number;
  priority_score?: number;
  meeting_source?: string | null;
  workflow_id?: string | null;
  workflow_stage?: string | null;
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
  position_id?: string | null;
  branch_id?: string | null;
  hiring_manager_position_id?: string | null;
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
  vacancy_status?: "open" | "backfill" | "pipeline" | "filled" | "cancelled";
  closes_at?: string;
}

export interface Applicant {
  id: string;
  job_id: string;
  org_id: string;
  hired_position_assignment_id?: string | null;
  full_name: string;
  email: string;
  phone?: string;
  source: "direct" | "referral" | "linkedin" | "job_board";
  stage: ApplicantStage;
  ai_score?: number;
  ai_summary?: string;
  candidate_resume_summary?: string | null;
  applied_at: string;
}

export interface TimeLog {
  id: string;
  org_id: string;
  task_id?: string | null;
  user_id?: string | null;
  source: "manual" | "timer" | "meeting" | "import";
  meeting_source?: string | null;
  started_at: string;
  ended_at?: string | null;
  minutes?: number | null;
  notes?: string | null;
  billable: boolean;
  created_at?: string;
}

export interface GoalTemplate {
  id: string;
  org_id: string;
  created_by?: string | null;
  name: string;
  description?: string | null;
  default_priority: GoalPriority;
  template: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface Integration {
  id: string;
  org_id: string;
  provider: "slack" | "teams" | "google_calendar" | "zapier" | "webhook";
  status: "inactive" | "active" | "error";
  config: Record<string, unknown>;
  last_synced_at?: string | null;
}

export interface AuditLogEntry {
  id: string;
  org_id?: string | null;
  actor_id?: string | null;
  action: string;
  entity: string;
  entity_id?: string | null;
  category: "general" | "security" | "auth" | "integration" | "analytics" | "billing";
  severity?: "debug" | "info" | "warn" | "error" | "critical";
  metadata?: Record<string, unknown>;
  user_agent?: string | null;
  ip_address?: string | null;
  path?: string | null;
  created_at?: string;
}

export interface AnalyticsOverview {
  overview: {
    totalGoals: number;
    totalTasks: number;
    completedTasks: number;
    activeTasks: number;
    blockedTasks: number;
    completionRate: number;
    billableHours: number;
    estimateVarianceHours: number;
    latestSnapshot: Record<string, unknown> | null;
  };
}

export interface ForecastResponse {
  horizonDays: number;
  byPriority: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  openEffortHours: number;
  staffingPressure?: number;
  blockedTaskCount?: number;
  forecast: Array<{
    bucket: string;
    expectedCompletion: number;
    remainingHours: number;
  }>;
  goalSignals?: Array<{
    goalId: string;
    title: string;
    risk: number;
    expectedCompletion14d: number;
    remainingHours: number;
  }>;
}
