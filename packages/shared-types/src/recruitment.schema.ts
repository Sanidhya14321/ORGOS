import { z } from "zod";

export const JobStatusSchema = z.enum(["open", "paused", "closed"]);
export const ApplicantStageSchema = z.enum(["applied", "screening", "interview", "offer", "hired", "rejected"]);

export const JobSchema = z.object({
  id: z.string().uuid(),
  org_id: z.string().uuid(),
  position_id: z.string().uuid().nullable().optional(),
  branch_id: z.string().uuid().nullable().optional(),
  hiring_manager_position_id: z.string().uuid().nullable().optional(),
  title: z.string().min(1),
  department: z.string().min(1),
  description: z.string().min(1),
  required_skills: z.array(z.string()).optional(),
  experience_years: z.number().int().nullable().optional(),
  employment_type: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  salary_min: z.number().int().nullable().optional(),
  salary_max: z.number().int().nullable().optional(),
  status: JobStatusSchema,
  vacancy_status: z.enum(["open", "backfill", "pipeline", "filled", "cancelled"]).default("open"),
  posted_by: z.string().uuid().nullable().optional(),
  closes_at: z.string().datetime().nullable().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime()
});

export const ApplicantSchema = z.object({
  id: z.string().uuid(),
  job_id: z.string().uuid(),
  org_id: z.string().uuid(),
  hired_position_assignment_id: z.string().uuid().nullable().optional(),
  full_name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().nullable().optional(),
  linkedin_url: z.string().url().nullable().optional(),
  portfolio_url: z.string().url().nullable().optional(),
  resume_path: z.string().nullable().optional(),
  cover_letter: z.string().nullable().optional(),
  skills: z.array(z.string()).optional(),
  experience_years: z.number().int().nullable().optional(),
  source: z.enum(["direct", "referral", "linkedin", "job_board"]),
  stage: ApplicantStageSchema,
  ai_score: z.number().nullable().optional(),
  ai_summary: z.string().nullable().optional(),
  candidate_resume_summary: z.string().nullable().optional(),
  ai_metadata: z.record(z.any()).optional(),
  applied_at: z.string().datetime(),
  created_at: z.string().datetime()
});

export type Job = z.infer<typeof JobSchema>;
export type Applicant = z.infer<typeof ApplicantSchema>;
