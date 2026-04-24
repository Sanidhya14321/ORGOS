import crypto from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { sendApiError } from "../lib/errors.js";
import { requireRole } from "../plugins/rbac.js";

const JobStatusSchema = z.enum(["open", "paused", "closed"]);
const ApplicantStageSchema = z.enum(["applied", "screening", "interview", "offer", "hired", "rejected"]);

const IdParamSchema = z.object({ id: z.string().uuid() });
const TokenParamSchema = z.object({ token: z.string().min(12).max(128) });

const ListJobsQuerySchema = z.object({
  status: JobStatusSchema.optional(),
  department: z.string().trim().min(1).max(120).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20)
});

const CreateJobBodyShape = z.object({
  title: z.string().trim().min(1).max(200),
  department: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(12000),
  requiredSkills: z.array(z.string().trim().min(1)).max(80).default([]),
  experienceYears: z.number().int().min(0).max(60).optional(),
  employmentType: z.string().trim().max(80).optional(),
  location: z.string().trim().max(120).optional(),
  salaryMin: z.number().int().min(0).optional(),
  salaryMax: z.number().int().min(0).optional(),
  status: JobStatusSchema.default("open"),
  closesAt: z.string().datetime().optional()
});

const CreateJobBodySchema = CreateJobBodyShape.superRefine((payload, ctx) => {
  if (payload.salaryMin !== undefined && payload.salaryMax !== undefined && payload.salaryMax < payload.salaryMin) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "salaryMax must be >= salaryMin", path: ["salaryMax"] });
  }
});

const UpdateJobBodySchema = CreateJobBodyShape.partial().superRefine((payload, ctx) => {
  if (payload.salaryMin !== undefined && payload.salaryMax !== undefined && payload.salaryMax < payload.salaryMin) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "salaryMax must be >= salaryMin", path: ["salaryMax"] });
  }
});

const ApplyBodySchema = z.object({
  fullName: z.string().trim().min(1).max(200),
  email: z.string().email(),
  phone: z.string().trim().max(40).optional(),
  linkedinUrl: z.string().url().optional(),
  portfolioUrl: z.string().url().optional(),
  resumePath: z.string().trim().max(500).optional(),
  coverLetter: z.string().trim().max(10000).optional(),
  skills: z.array(z.string().trim().min(1)).max(80).default([]),
  experienceYears: z.number().int().min(0).max(60).optional(),
  source: z.enum(["direct", "referral", "linkedin", "job_board"]).default("direct")
});

const CreateReferralBodySchema = z.object({
  candidateName: z.string().trim().min(1).max(200),
  candidateEmail: z.string().email(),
  relationship: z.string().trim().max(160).optional(),
  note: z.string().trim().max(2000).optional()
});

const ApplicantStageBodySchema = z.object({
  stage: ApplicantStageSchema,
  note: z.string().trim().max(2000).optional()
});

const ScheduleInterviewBodySchema = z.object({
  interviewerId: z.string().uuid(),
  round: z.number().int().min(1).max(20),
  interviewType: z.enum(["phone", "video", "onsite", "technical", "panel"]),
  scheduledAt: z.string().datetime(),
  durationMins: z.number().int().min(15).max(360).default(60)
});

const CreateRejectionTemplateBodySchema = z.object({
  reason: z.string().trim().min(1).max(200),
  emailBody: z.string().trim().min(1).max(12000),
  autoSend: z.boolean().default(false)
});

function isSchemaCacheUnavailable(error: { code?: string } | null | undefined): boolean {
  return error?.code === "PGRST205" || error?.code === "PGRST204";
}

function mockResumeSummary(input: {
  fullName: string;
  skills: string[];
  experienceYears?: number | null;
  coverLetter?: string | null;
}): string {
  const topSkills = input.skills.slice(0, 5).join(", ") || "generalist profile";
  const years = input.experienceYears ?? 0;
  const coverLetterHint = input.coverLetter && input.coverLetter.length > 120 ? "strong motivation signal" : "limited motivation signal";
  return `${input.fullName} appears to have ${years} years of experience with ${topSkills}; ${coverLetterHint}.`;
}

function mockFitScore(input: { skills: string[]; requiredSkills: string[]; experienceYears?: number | null }): number {
  const req = new Set(input.requiredSkills.map((s) => s.toLowerCase()));
  if (req.size === 0) {
    return 0.7;
  }

  const matched = input.skills.filter((s) => req.has(s.toLowerCase())).length;
  const coverage = matched / req.size;
  const expBoost = Math.min((input.experienceYears ?? 0) / 10, 0.2);
  return Math.min(1, Number((coverage * 0.8 + expBoost).toFixed(4)));
}

function buildInterviewQuestions(requiredSkills: string[], stage: z.infer<typeof ApplicantStageSchema>) {
  const skills = requiredSkills.slice(0, 4);
  const base = [
    "Walk us through one project where your contribution changed the business outcome.",
    "How do you prioritize when deadlines compress unexpectedly?",
    "Describe a conflict with a peer and how you resolved it."
  ];

  const skillQuestions = skills.map((skill) => `How would you evaluate trade-offs when implementing ${skill} in production?`);
  const stagePrompt = stage === "interview" || stage === "offer"
    ? "What would your first 30-60-90 day plan look like for this role?"
    : "What are you optimizing for in your next role, and why now?";

  return [...base, ...skillQuestions, stagePrompt];
}

const recruitmentRoutes: FastifyPluginAsync = async (fastify) => {
  async function getRequesterOrgId(userId: string): Promise<string | null> {
    const requester = await fastify.supabaseService
      .from("users")
      .select("org_id")
      .eq("id", userId)
      .maybeSingle();

    return (requester.data?.org_id as string | null | undefined) ?? null;
  }

  fastify.get("/recruitment/jobs", async (request, reply) => {
    const query = ListJobsQuerySchema.safeParse(request.query);
    if (!query.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid jobs query");
    }

    const userId = request.user?.id;
    if (!userId) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const requesterOrgId = await getRequesterOrgId(userId);
    if (!requesterOrgId) {
      return sendApiError(reply, request, 403, "FORBIDDEN", "Requester is not assigned to an organization");
    }

    const page = query.data.page;
    const limit = query.data.limit;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let jobsQuery = fastify.supabaseService
      .from("jobs")
      .select("*", { count: "exact" })
      .eq("org_id", requesterOrgId)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (query.data.status) {
      jobsQuery = jobsQuery.eq("status", query.data.status);
    }
    if (query.data.department) {
      jobsQuery = jobsQuery.eq("department", query.data.department);
    }

    const result = await jobsQuery;
    if (result.error) {
      if (isSchemaCacheUnavailable(result.error)) {
        return reply.send({ page, limit, total: 0, items: [] });
      }
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to fetch jobs");
    }

    return reply.send({ page, limit, total: result.count ?? 0, items: result.data ?? [] });
  });

  fastify.post("/recruitment/jobs", { preHandler: requireRole("ceo", "cfo", "manager") }, async (request, reply) => {
    const body = CreateJobBodySchema.safeParse(request.body);
    if (!body.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid create job payload", {
        details: body.error.flatten()
      });
    }

    const userId = request.user?.id;
    if (!userId) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const requesterOrgId = await getRequesterOrgId(userId);
    if (!requesterOrgId) {
      return sendApiError(reply, request, 403, "FORBIDDEN", "Requester is not assigned to an organization");
    }

    const insertResult = await fastify.supabaseService
      .from("jobs")
      .insert({
        org_id: requesterOrgId,
        title: body.data.title,
        department: body.data.department,
        description: body.data.description,
        required_skills: body.data.requiredSkills,
        experience_years: body.data.experienceYears ?? null,
        employment_type: body.data.employmentType ?? null,
        location: body.data.location ?? null,
        salary_min: body.data.salaryMin ?? null,
        salary_max: body.data.salaryMax ?? null,
        status: body.data.status,
        posted_by: userId,
        closes_at: body.data.closesAt ?? null
      })
      .select("*")
      .single();

    if (insertResult.error || !insertResult.data) {
      if (isSchemaCacheUnavailable(insertResult.error)) {
        return sendApiError(reply, request, 503, "SERVICE_UNAVAILABLE", "Recruitment schema not available yet; apply DB migrations first");
      }
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to create job");
    }

    return reply.status(201).send(insertResult.data);
  });

  fastify.get("/recruitment/jobs/:id", async (request, reply) => {
    const params = IdParamSchema.safeParse(request.params);
    if (!params.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid job id", { field: "id" });
    }

    const userId = request.user?.id;
    if (!userId) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const requesterOrgId = await getRequesterOrgId(userId);
    if (!requesterOrgId) {
      return sendApiError(reply, request, 403, "FORBIDDEN", "Requester is not assigned to an organization");
    }

    const result = await fastify.supabaseService
      .from("jobs")
      .select("*")
      .eq("id", params.data.id)
      .eq("org_id", requesterOrgId)
      .maybeSingle();

    if (result.error) {
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to fetch job");
    }
    if (!result.data) {
      return sendApiError(reply, request, 404, "NOT_FOUND", "Job not found");
    }

    return reply.send(result.data);
  });

  fastify.patch("/recruitment/jobs/:id", { preHandler: requireRole("ceo", "cfo", "manager") }, async (request, reply) => {
    const params = IdParamSchema.safeParse(request.params);
    const body = UpdateJobBodySchema.safeParse(request.body);

    if (!params.success || !body.success || Object.keys(body.data).length === 0) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid update job payload");
    }

    const userId = request.user?.id;
    if (!userId) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const requesterOrgId = await getRequesterOrgId(userId);
    if (!requesterOrgId) {
      return sendApiError(reply, request, 403, "FORBIDDEN", "Requester is not assigned to an organization");
    }

    const patch = {
      ...(body.data.title !== undefined ? { title: body.data.title } : {}),
      ...(body.data.department !== undefined ? { department: body.data.department } : {}),
      ...(body.data.description !== undefined ? { description: body.data.description } : {}),
      ...(body.data.requiredSkills !== undefined ? { required_skills: body.data.requiredSkills } : {}),
      ...(body.data.experienceYears !== undefined ? { experience_years: body.data.experienceYears } : {}),
      ...(body.data.employmentType !== undefined ? { employment_type: body.data.employmentType } : {}),
      ...(body.data.location !== undefined ? { location: body.data.location } : {}),
      ...(body.data.salaryMin !== undefined ? { salary_min: body.data.salaryMin } : {}),
      ...(body.data.salaryMax !== undefined ? { salary_max: body.data.salaryMax } : {}),
      ...(body.data.status !== undefined ? { status: body.data.status } : {}),
      ...(body.data.closesAt !== undefined ? { closes_at: body.data.closesAt } : {}),
      updated_at: new Date().toISOString()
    };

    const result = await fastify.supabaseService
      .from("jobs")
      .update(patch)
      .eq("id", params.data.id)
      .eq("org_id", requesterOrgId)
      .select("*")
      .maybeSingle();

    if (result.error) {
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to update job");
    }
    if (!result.data) {
      return sendApiError(reply, request, 404, "NOT_FOUND", "Job not found");
    }

    return reply.send(result.data);
  });

  fastify.get("/recruitment/jobs/:id/applicants", { preHandler: requireRole("ceo", "cfo", "manager") }, async (request, reply) => {
    const params = IdParamSchema.safeParse(request.params);
    if (!params.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid job id", { field: "id" });
    }

    const userId = request.user?.id;
    if (!userId) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const requesterOrgId = await getRequesterOrgId(userId);
    if (!requesterOrgId) {
      return sendApiError(reply, request, 403, "FORBIDDEN", "Requester is not assigned to an organization");
    }

    const result = await fastify.supabaseService
      .from("applicants")
      .select("*")
      .eq("job_id", params.data.id)
      .eq("org_id", requesterOrgId)
      .order("applied_at", { ascending: false });

    if (result.error) {
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to fetch applicants");
    }

    return reply.send({ items: result.data ?? [] });
  });

  fastify.post("/recruitment/jobs/:id/apply", async (request, reply) => {
    const params = IdParamSchema.safeParse(request.params);
    const body = ApplyBodySchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid application payload", {
        details: body.success ? undefined : body.error.flatten()
      });
    }

    const jobResult = await fastify.supabaseService
      .from("jobs")
      .select("id, org_id, status")
      .eq("id", params.data.id)
      .maybeSingle();

    if (jobResult.error || !jobResult.data) {
      return sendApiError(reply, request, 404, "NOT_FOUND", "Job not found");
    }

    if (jobResult.data.status !== "open") {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Job is not accepting applications");
    }

    const insertResult = await fastify.supabaseService
      .from("applicants")
      .insert({
        job_id: params.data.id,
        org_id: jobResult.data.org_id,
        full_name: body.data.fullName,
        email: body.data.email,
        phone: body.data.phone ?? null,
        linkedin_url: body.data.linkedinUrl ?? null,
        portfolio_url: body.data.portfolioUrl ?? null,
        resume_path: body.data.resumePath ?? null,
        cover_letter: body.data.coverLetter ?? null,
        skills: body.data.skills,
        experience_years: body.data.experienceYears ?? null,
        source: body.data.source,
        stage: "applied"
      })
      .select("*")
      .single();

    if (insertResult.error || !insertResult.data) {
      if (String(insertResult.error?.code) === "23505") {
        return sendApiError(reply, request, 409, "CONFLICT", "Application already exists for this email and job");
      }
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to submit application");
    }

    return reply.status(201).send(insertResult.data);
  });

  fastify.post("/recruitment/jobs/:id/referrals", { preHandler: requireRole("ceo", "cfo", "manager", "worker") }, async (request, reply) => {
    const params = IdParamSchema.safeParse(request.params);
    const body = CreateReferralBodySchema.safeParse(request.body);

    if (!params.success || !body.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid referral payload", {
        details: body.success ? undefined : body.error.flatten()
      });
    }

    const userId = request.user?.id;
    if (!userId) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const requesterOrgId = await getRequesterOrgId(userId);
    if (!requesterOrgId) {
      return sendApiError(reply, request, 403, "FORBIDDEN", "Requester is not assigned to an organization");
    }

    const jobResult = await fastify.supabaseService
      .from("jobs")
      .select("id, org_id")
      .eq("id", params.data.id)
      .eq("org_id", requesterOrgId)
      .maybeSingle();

    if (jobResult.error || !jobResult.data) {
      return sendApiError(reply, request, 404, "NOT_FOUND", "Job not found");
    }

    const referralToken = crypto.randomBytes(16).toString("hex");

    const insertResult = await fastify.supabaseService
      .from("referrals")
      .insert({
        referred_by: userId,
        job_id: params.data.id,
        org_id: requesterOrgId,
        relationship: body.data.relationship ?? null,
        note: body.data.note ?? null,
        referral_token: referralToken,
        candidate_name: body.data.candidateName,
        candidate_email: body.data.candidateEmail,
        status: "pending"
      })
      .select("*")
      .single();

    if (insertResult.error || !insertResult.data) {
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to create referral");
    }

    return reply.status(201).send({
      ...insertResult.data,
      applyPath: `/api/recruitment/referrals/${referralToken}/apply`
    });
  });

  fastify.post("/recruitment/referrals/:token/apply", async (request, reply) => {
    const params = TokenParamSchema.safeParse(request.params);
    const body = ApplyBodySchema.safeParse(request.body);

    if (!params.success || !body.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid referral apply payload", {
        details: body.success ? undefined : body.error.flatten()
      });
    }

    const referralResult = await fastify.supabaseService
      .from("referrals")
      .select("id, org_id, job_id, status")
      .eq("referral_token", params.data.token)
      .maybeSingle();

    if (referralResult.error || !referralResult.data) {
      return sendApiError(reply, request, 404, "NOT_FOUND", "Referral token not found");
    }

    if (referralResult.data.status === "rejected") {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Referral is not active");
    }

    const applicantInsert = await fastify.supabaseService
      .from("applicants")
      .insert({
        job_id: referralResult.data.job_id,
        org_id: referralResult.data.org_id,
        full_name: body.data.fullName,
        email: body.data.email,
        phone: body.data.phone ?? null,
        linkedin_url: body.data.linkedinUrl ?? null,
        portfolio_url: body.data.portfolioUrl ?? null,
        resume_path: body.data.resumePath ?? null,
        cover_letter: body.data.coverLetter ?? null,
        skills: body.data.skills,
        experience_years: body.data.experienceYears ?? null,
        source: "referral",
        stage: "applied"
      })
      .select("*")
      .single();

    if (applicantInsert.error || !applicantInsert.data) {
      if (String(applicantInsert.error?.code) === "23505") {
        return sendApiError(reply, request, 409, "CONFLICT", "Application already exists for this email and job");
      }
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to submit referral application");
    }

    await fastify.supabaseService
      .from("referrals")
      .update({
        applicant_id: applicantInsert.data.id,
        status: "confirmed",
        updated_at: new Date().toISOString()
      })
      .eq("id", referralResult.data.id);

    return reply.status(201).send(applicantInsert.data);
  });

  fastify.patch("/recruitment/applicants/:id/stage", { preHandler: requireRole("ceo", "cfo", "manager") }, async (request, reply) => {
    const params = IdParamSchema.safeParse(request.params);
    const body = ApplicantStageBodySchema.safeParse(request.body);

    if (!params.success || !body.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid applicant stage payload");
    }

    const userId = request.user?.id;
    if (!userId) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const requesterOrgId = await getRequesterOrgId(userId);
    if (!requesterOrgId) {
      return sendApiError(reply, request, 403, "FORBIDDEN", "Requester is not assigned to an organization");
    }

    const updateResult = await fastify.supabaseService
      .from("applicants")
      .update({ stage: body.data.stage })
      .eq("id", params.data.id)
      .eq("org_id", requesterOrgId)
      .select("*")
      .maybeSingle();

    if (updateResult.error) {
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to update applicant stage");
    }
    if (!updateResult.data) {
      return sendApiError(reply, request, 404, "NOT_FOUND", "Applicant not found");
    }

    await fastify.supabaseService
      .from("pipeline_events")
      .insert({
        applicant_id: updateResult.data.id,
        actor_id: userId,
        from_stage: null,
        to_stage: body.data.stage,
        note: body.data.note ?? "Stage updated"
      });

    return reply.send(updateResult.data);
  });

  fastify.post("/recruitment/applicants/:id/interviews", { preHandler: requireRole("ceo", "cfo", "manager") }, async (request, reply) => {
    const params = IdParamSchema.safeParse(request.params);
    const body = ScheduleInterviewBodySchema.safeParse(request.body);

    if (!params.success || !body.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid interview payload");
    }

    const userId = request.user?.id;
    if (!userId) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const requesterOrgId = await getRequesterOrgId(userId);
    if (!requesterOrgId) {
      return sendApiError(reply, request, 403, "FORBIDDEN", "Requester is not assigned to an organization");
    }

    const applicantResult = await fastify.supabaseService
      .from("applicants")
      .select("id")
      .eq("id", params.data.id)
      .eq("org_id", requesterOrgId)
      .maybeSingle();

    if (applicantResult.error || !applicantResult.data) {
      return sendApiError(reply, request, 404, "NOT_FOUND", "Applicant not found");
    }

    const insertResult = await fastify.supabaseService
      .from("interviews")
      .insert({
        applicant_id: params.data.id,
        interviewer_id: body.data.interviewerId,
        round: body.data.round,
        interview_type: body.data.interviewType,
        scheduled_at: body.data.scheduledAt,
        duration_mins: body.data.durationMins,
        status: "scheduled"
      })
      .select("*")
      .single();

    if (insertResult.error || !insertResult.data) {
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to schedule interview");
    }

    return reply.status(201).send(insertResult.data);
  });

  fastify.get("/recruitment/applicants/:id/interviews", { preHandler: requireRole("ceo", "cfo", "manager") }, async (request, reply) => {
    const params = IdParamSchema.safeParse(request.params);
    if (!params.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid applicant id", { field: "id" });
    }

    const userId = request.user?.id;
    if (!userId) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const requesterOrgId = await getRequesterOrgId(userId);
    if (!requesterOrgId) {
      return sendApiError(reply, request, 403, "FORBIDDEN", "Requester is not assigned to an organization");
    }

    const applicantResult = await fastify.supabaseService
      .from("applicants")
      .select("id")
      .eq("id", params.data.id)
      .eq("org_id", requesterOrgId)
      .maybeSingle();

    if (applicantResult.error || !applicantResult.data) {
      return sendApiError(reply, request, 404, "NOT_FOUND", "Applicant not found");
    }

    const result = await fastify.supabaseService
      .from("interviews")
      .select("*")
      .eq("applicant_id", params.data.id)
      .order("scheduled_at", { ascending: false });

    if (result.error) {
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to fetch interviews");
    }

    return reply.send({ items: result.data ?? [] });
  });

  fastify.get("/recruitment/rejection-templates", { preHandler: requireRole("ceo", "cfo", "manager") }, async (request, reply) => {
    const userId = request.user?.id;
    if (!userId) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const requesterOrgId = await getRequesterOrgId(userId);
    if (!requesterOrgId) {
      return sendApiError(reply, request, 403, "FORBIDDEN", "Requester is not assigned to an organization");
    }

    const result = await fastify.supabaseService
      .from("rejection_templates")
      .select("*")
      .eq("org_id", requesterOrgId)
      .order("created_at", { ascending: false });

    if (result.error) {
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to fetch rejection templates");
    }

    return reply.send({ items: result.data ?? [] });
  });

  fastify.post("/recruitment/rejection-templates", { preHandler: requireRole("ceo", "cfo", "manager") }, async (request, reply) => {
    const body = CreateRejectionTemplateBodySchema.safeParse(request.body);
    if (!body.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid rejection template payload", {
        details: body.error.flatten()
      });
    }

    const userId = request.user?.id;
    if (!userId) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const requesterOrgId = await getRequesterOrgId(userId);
    if (!requesterOrgId) {
      return sendApiError(reply, request, 403, "FORBIDDEN", "Requester is not assigned to an organization");
    }

    const insertResult = await fastify.supabaseService
      .from("rejection_templates")
      .insert({
        org_id: requesterOrgId,
        reason: body.data.reason,
        email_body: body.data.emailBody,
        auto_send: body.data.autoSend
      })
      .select("*")
      .single();

    if (insertResult.error || !insertResult.data) {
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to create rejection template");
    }

    return reply.status(201).send(insertResult.data);
  });

  fastify.post("/recruitment/applicants/:id/ai/parse-resume", { preHandler: requireRole("ceo", "cfo", "manager") }, async (request, reply) => {
    const params = IdParamSchema.safeParse(request.params);
    if (!params.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid applicant id", { field: "id" });
    }

    const userId = request.user?.id;
    if (!userId) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const requesterOrgId = await getRequesterOrgId(userId);
    if (!requesterOrgId) {
      return sendApiError(reply, request, 403, "FORBIDDEN", "Requester is not assigned to an organization");
    }

    const applicantResult = await fastify.supabaseService
      .from("applicants")
      .select("id, full_name, skills, experience_years, cover_letter, ai_summary, ai_metadata")
      .eq("id", params.data.id)
      .eq("org_id", requesterOrgId)
      .maybeSingle();

    if (applicantResult.error || !applicantResult.data) {
      return sendApiError(reply, request, 404, "NOT_FOUND", "Applicant not found");
    }

    const aiMetadata = (applicantResult.data.ai_metadata as Record<string, unknown> | null) ?? {};
    if (aiMetadata.resume_parsed === true) {
      return reply.send({
        applicantId: applicantResult.data.id,
        parsedOnce: true,
        summary: applicantResult.data.ai_summary
      });
    }

    const summary = mockResumeSummary({
      fullName: applicantResult.data.full_name as string,
      skills: (applicantResult.data.skills as string[] | null) ?? [],
      experienceYears: (applicantResult.data.experience_years as number | null | undefined) ?? null,
      coverLetter: (applicantResult.data.cover_letter as string | null | undefined) ?? null
    });

    const updateMetadata = {
      ...aiMetadata,
      resume_parsed: true,
      resume_parsed_at: new Date().toISOString()
    };

    await fastify.supabaseService
      .from("applicants")
      .update({
        ai_summary: summary,
        ai_metadata: updateMetadata
      })
      .eq("id", applicantResult.data.id);

    return reply.send({ applicantId: applicantResult.data.id, parsedOnce: false, summary });
  });

  fastify.post("/recruitment/applicants/:id/ai/fit-score", { preHandler: requireRole("ceo", "cfo", "manager") }, async (request, reply) => {
    const params = IdParamSchema.safeParse(request.params);
    if (!params.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid applicant id", { field: "id" });
    }

    const userId = request.user?.id;
    if (!userId) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const requesterOrgId = await getRequesterOrgId(userId);
    if (!requesterOrgId) {
      return sendApiError(reply, request, 403, "FORBIDDEN", "Requester is not assigned to an organization");
    }

    const applicantResult = await fastify.supabaseService
      .from("applicants")
      .select("id, job_id, org_id, skills, experience_years, ai_score, ai_metadata")
      .eq("id", params.data.id)
      .eq("org_id", requesterOrgId)
      .maybeSingle();

    if (applicantResult.error || !applicantResult.data) {
      return sendApiError(reply, request, 404, "NOT_FOUND", "Applicant not found");
    }

    const aiMetadata = (applicantResult.data.ai_metadata as Record<string, unknown> | null) ?? {};
    if (aiMetadata.fit_scored === true && applicantResult.data.ai_score !== null) {
      return reply.send({
        applicantId: applicantResult.data.id,
        scoredOnce: true,
        fitScore: applicantResult.data.ai_score
      });
    }

    const jobResult = await fastify.supabaseService
      .from("jobs")
      .select("required_skills")
      .eq("id", applicantResult.data.job_id as string)
      .eq("org_id", requesterOrgId)
      .maybeSingle();

    if (jobResult.error || !jobResult.data) {
      return sendApiError(reply, request, 404, "NOT_FOUND", "Job not found for applicant");
    }

    const fitScore = mockFitScore({
      skills: (applicantResult.data.skills as string[] | null) ?? [],
      requiredSkills: (jobResult.data.required_skills as string[] | null) ?? [],
      experienceYears: (applicantResult.data.experience_years as number | null | undefined) ?? null
    });

    const updateMetadata = {
      ...aiMetadata,
      fit_scored: true,
      fit_scored_at: new Date().toISOString()
    };

    await fastify.supabaseService
      .from("applicants")
      .update({
        ai_score: fitScore,
        ai_metadata: updateMetadata
      })
      .eq("id", applicantResult.data.id);

    return reply.send({ applicantId: applicantResult.data.id, scoredOnce: false, fitScore });
  });

  fastify.post("/recruitment/applicants/:id/ai/interview-questions", { preHandler: requireRole("ceo", "cfo", "manager") }, async (request, reply) => {
    const params = IdParamSchema.safeParse(request.params);
    if (!params.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid applicant id", { field: "id" });
    }

    const userId = request.user?.id;
    if (!userId) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const requesterOrgId = await getRequesterOrgId(userId);
    if (!requesterOrgId) {
      return sendApiError(reply, request, 403, "FORBIDDEN", "Requester is not assigned to an organization");
    }

    const applicantResult = await fastify.supabaseService
      .from("applicants")
      .select("id, stage, job_id")
      .eq("id", params.data.id)
      .eq("org_id", requesterOrgId)
      .maybeSingle();

    if (applicantResult.error || !applicantResult.data) {
      return sendApiError(reply, request, 404, "NOT_FOUND", "Applicant not found");
    }

    const jobResult = await fastify.supabaseService
      .from("jobs")
      .select("required_skills")
      .eq("id", applicantResult.data.job_id as string)
      .eq("org_id", requesterOrgId)
      .maybeSingle();

    if (jobResult.error || !jobResult.data) {
      return sendApiError(reply, request, 404, "NOT_FOUND", "Job not found for applicant");
    }

    const questions = buildInterviewQuestions(
      (jobResult.data.required_skills as string[] | null) ?? [],
      applicantResult.data.stage as z.infer<typeof ApplicantStageSchema>
    );

    return reply.send({ applicantId: applicantResult.data.id, generatedAt: new Date().toISOString(), questions });
  });
};

export default recruitmentRoutes;
