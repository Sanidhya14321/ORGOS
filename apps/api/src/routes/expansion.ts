import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireRole } from "../plugins/rbac.js";
import { sendApiError } from "../lib/errors.js";
import { writeAuditEvent } from "../lib/audit.js";
import type { AuditEventInput } from "../lib/audit.js";
import { getIngestQueue } from "../queue/index.js";

const OrgParamSchema = z.object({ orgId: z.string().uuid() });
const TaskParamSchema = z.object({ id: z.string().uuid() });

const GoalTemplateSchema = z.object({
  orgId: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(200),
  description: z.string().trim().max(2000).optional(),
  defaultPriority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  template: z.record(z.unknown()).default({})
});

const CreateFromTemplateSchema = z.object({
  templateId: z.string().uuid(),
  title: z.string().trim().min(2).max(200).optional(),
  deadline: z.string().datetime().optional(),
  overrides: z.record(z.unknown()).optional()
});

const ManualTimeLogSchema = z.object({
  taskId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().optional(),
  notes: z.string().trim().max(2000).optional(),
  billable: z.boolean().default(false),
  source: z.enum(["manual", "timer", "meeting", "import"]).default("manual"),
  meetingSource: z.string().trim().max(120).optional()
});

const MeetingImportSchema = z.object({
  orgId: z.string().uuid().optional(),
  source: z.enum(["calendar", "zoom", "teams", "manual", "upload"]),
  externalId: z.string().trim().max(200).optional(),
  subject: z.string().trim().min(1).max(200),
  notes: z.string().trim().max(5000).optional(),
  meetingAt: z.string().datetime().optional(),
  attendees: z.array(z.object({
    email: z.string().email(),
    name: z.string().trim().max(120).optional()
  })).default([]),
  rawTranscript: z.string().trim().max(20000).optional()
});

const ParseInputSchema = z.object({
  text: z.string().trim().min(1).max(4000),
  context: z.record(z.unknown()).optional()
});

const AskSchema = z.object({
  question: z.string().trim().min(1).max(4000),
  context: z.record(z.unknown()).optional()
});

const IntegrationSchema = z.object({
  provider: z.enum(["slack", "teams", "google_calendar", "zapier", "webhook"]),
  status: z.enum(["inactive", "active", "error"]).default("inactive"),
  config: z.record(z.unknown()).default({}),
  orgId: z.string().uuid().optional()
});

const CustomFieldSchema = z.object({
  orgId: z.string().uuid(),
  entityType: z.enum(["goal", "task", "user", "applicant", "meeting"]),
  fieldKey: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(120),
  fieldType: z.enum(["text", "number", "boolean", "date", "json", "select"]),
  options: z.array(z.string().trim().min(1)).default([]),
  required: z.boolean().default(false)
});

const PushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  p256dh: z.string().trim().min(1),
  auth: z.string().trim().min(1),
  metadata: z.record(z.unknown()).default({})
});

function isMissingSchemaCache(error: { code?: string } | null | undefined): boolean {
  return error?.code === "PGRST205" || error?.code === "PGRST204";
}

async function resolveOrgContext(fastify: Parameters<FastifyPluginAsync>[0], userId: string): Promise<{ orgId: string | null; role: string | null }> {
  const { data, error } = await fastify.supabaseService
    .from("users")
    .select("org_id, role")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) {
    return { orgId: null, role: null };
  }

  return {
    orgId: (data.org_id as string | null | undefined) ?? null,
    role: (data.role as string | null | undefined) ?? null
  };
}

function getHeaderValue(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }
  return null;
}

function summarizeText(text: string, maxLength = 180): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length <= maxLength ? collapsed : `${collapsed.slice(0, maxLength - 1)}…`;
}

function parseActionFromInput(text: string): { kind: "goal" | "task" | "meeting" | "note"; title: string; description?: string; priority: "low" | "medium" | "high" | "critical" } {
  const normalized = text.toLowerCase();
  const priority = normalized.includes("critical")
    ? "critical"
    : normalized.includes("urgent") || normalized.includes("high priority")
      ? "high"
      : normalized.includes("low priority")
        ? "low"
        : "medium";

  if (normalized.includes("meeting") || normalized.includes("sync") || normalized.includes("call")) {
    return { kind: "meeting", title: summarizeText(text, 80), description: text, priority };
  }

  if (normalized.includes("goal") || normalized.includes("objective") || normalized.includes("okr")) {
    return { kind: "goal", title: summarizeText(text, 80), description: text, priority };
  }

  if (normalized.includes("task") || normalized.includes("todo") || normalized.includes("follow up") || normalized.includes("action item")) {
    return { kind: "task", title: summarizeText(text, 80), description: text, priority };
  }

  return { kind: "note", title: summarizeText(text, 80), description: text, priority };
}

async function createSecurityAudit(fastify: Parameters<FastifyPluginAsync>[0], request: { user?: { id: string } | null; userRole?: string | null; headers: Record<string, unknown>; url: string; ip: string }, action: string, entity: string, entityId?: string | null, metadata?: Record<string, unknown>) {
  const orgContext = request.user?.id ? await resolveOrgContext(fastify, request.user.id) : { orgId: null, role: null };
  const auditPayload: AuditEventInput = {
    orgId: orgContext.orgId,
    actorId: request.user?.id ?? null,
    category: "security",
    severity: "info",
    action,
    entity,
    entityId: entityId ?? null,
    path: request.url,
    userAgent: getHeaderValue(request.headers["user-agent"]),
    ipAddress: request.ip
  } as const;

  if (metadata) {
    auditPayload.metadata = metadata;
  }

  await writeAuditEvent(fastify, auditPayload);
}

const expansionRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/security-log", { preHandler: requireRole("ceo", "cfo") }, async (request, reply) => {
    const userId = request.user?.id;
    if (!userId) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const orgContext = await resolveOrgContext(fastify, userId);
    if (!orgContext.orgId) {
      return sendApiError(reply, request, 403, "FORBIDDEN", "User is not assigned to an organization");
    }

    const { data, error } = await fastify.supabaseService
      .from("audit_log")
      .select("id, org_id, actor_id, action, entity, entity_id, category, severity, metadata, user_agent, ip_address, path, created_at")
      .eq("org_id", orgContext.orgId)
      .eq("category", "security")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      if (isMissingSchemaCache(error)) {
        return reply.send({ items: [] });
      }
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to load security log");
    }

    return reply.send({ items: data ?? [] });
  });

  fastify.get("/analytics/overview", { preHandler: requireRole("ceo", "cfo", "manager") }, async (request, reply) => {
    const userId = request.user?.id;
    if (!userId) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const orgContext = await resolveOrgContext(fastify, userId);
    if (!orgContext.orgId) {
      return sendApiError(reply, request, 403, "FORBIDDEN", "User is not assigned to an organization");
    }

    const [tasksResult, goalsResult, timeLogsResult, snapshotResult] = await Promise.all([
      fastify.supabaseService.from("tasks").select("id, status, priority, estimated_effort_hours, actual_hours, assignees").eq("org_id", orgContext.orgId),
      fastify.supabaseService.from("goals").select("id, status, priority, deadline").in("created_by", [userId]),
      fastify.supabaseService.from("time_logs").select("id, minutes, started_at, ended_at, billable").eq("org_id", orgContext.orgId),
      fastify.supabaseService.from("analytics_snapshots").select("id, snapshot_date, metrics").eq("org_id", orgContext.orgId).order("snapshot_date", { ascending: false }).limit(1)
    ]);

    const tasks = tasksResult.data ?? [];
    const goals = goalsResult.data ?? [];
    const timeLogs = timeLogsResult.data ?? [];
    const completedTasks = tasks.filter((task) => task.status === "completed").length;
    const activeTasks = tasks.filter((task) => task.status === "active" || task.status === "in_progress").length;
    const blockedTasks = tasks.filter((task) => task.status === "blocked").length;
    const billableMinutes = timeLogs.reduce((total, entry) => total + Number(entry.minutes ?? 0), 0);
    const totalEstimated = tasks.reduce((total, task) => total + Number(task.estimated_effort_hours ?? 0), 0);
    const totalActual = tasks.reduce((total, task) => total + Number(task.actual_hours ?? 0), 0);

    const overview = {
      totalGoals: goals.length,
      totalTasks: tasks.length,
      completedTasks,
      activeTasks,
      blockedTasks,
      completionRate: tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0,
      billableHours: Math.round((billableMinutes / 60) * 10) / 10,
      estimateVarianceHours: Math.round((totalActual - totalEstimated) * 10) / 10,
      latestSnapshot: snapshotResult.data?.[0] ?? null
    };

    return reply.send({ overview });
  });

  fastify.get("/orgs/:orgId/forecast", { preHandler: requireRole("ceo", "cfo", "manager") }, async (request, reply) => {
    const params = OrgParamSchema.safeParse(request.params);
    if (!params.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid organization id", { field: "orgId" });
    }

    const userId = request.user?.id;
    if (!userId) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const orgContext = await resolveOrgContext(fastify, userId);
    if (!orgContext.orgId || orgContext.orgId !== params.data.orgId) {
      return sendApiError(reply, request, 403, "FORBIDDEN", "Forecast is scoped to the requester's organization");
    }

    const { data: tasks, error } = await fastify.supabaseService
      .from("tasks")
      .select("id, status, priority, estimated_effort_hours, actual_hours, deadline, assigned_role")
      .eq("org_id", params.data.orgId);

    if (error) {
      if (isMissingSchemaCache(error)) {
        return reply.send({ horizonDays: 14, forecast: [] });
      }
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to build forecast");
    }

    const byPriority = {
      critical: tasks?.filter((task) => task.priority === "critical").length ?? 0,
      high: tasks?.filter((task) => task.priority === "high").length ?? 0,
      medium: tasks?.filter((task) => task.priority === "medium" || !task.priority).length ?? 0,
      low: tasks?.filter((task) => task.priority === "low").length ?? 0
    };

    const openEffort = (tasks ?? []).filter((task) => task.status !== "completed" && task.status !== "cancelled").reduce((total, task) => total + Number(task.estimated_effort_hours ?? 0), 0);
    const forecast = [
      { bucket: "7d", expectedCompletion: Math.min(100, Math.round((tasks?.filter((task) => task.status === "completed").length ?? 0) / Math.max(tasks?.length ?? 1, 1) * 120)), remainingHours: Math.round(openEffort * 0.45 * 10) / 10 },
      { bucket: "14d", expectedCompletion: Math.min(100, Math.round((tasks?.filter((task) => task.status === "completed").length ?? 0) / Math.max(tasks?.length ?? 1, 1) * 140)), remainingHours: Math.round(openEffort * 0.25 * 10) / 10 },
      { bucket: "30d", expectedCompletion: Math.min(100, Math.round((tasks?.filter((task) => task.status === "completed").length ?? 0) / Math.max(tasks?.length ?? 1, 1) * 170)), remainingHours: Math.round(openEffort * 0.1 * 10) / 10 }
    ];

    return reply.send({
      horizonDays: 30,
      byPriority,
      openEffortHours: Math.round(openEffort * 10) / 10,
      forecast
    });
  });

  fastify.get("/goal-templates", { preHandler: requireRole("ceo", "cfo", "manager") }, async (request, reply) => {
    const userId = request.user?.id;
    if (!userId) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const orgContext = await resolveOrgContext(fastify, userId);
    if (!orgContext.orgId) {
      return sendApiError(reply, request, 403, "FORBIDDEN", "User is not assigned to an organization");
    }

    const { data, error } = await fastify.supabaseService
      .from("goal_templates")
      .select("id, org_id, created_by, name, description, default_priority, template, created_at, updated_at")
      .eq("org_id", orgContext.orgId)
      .order("updated_at", { ascending: false });

    if (error) {
      if (isMissingSchemaCache(error)) {
        return reply.send({ items: [] });
      }
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to load goal templates");
    }

    return reply.send({ items: data ?? [] });
  });

  fastify.post("/goal-templates", { preHandler: requireRole("ceo", "cfo") }, async (request, reply) => {
    const parsed = GoalTemplateSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid goal template payload", {
        details: parsed.error.flatten()
      });
    }

    const userId = request.user?.id;
    if (!userId) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const orgContext = await resolveOrgContext(fastify, userId);
    if (!orgContext.orgId) {
      return sendApiError(reply, request, 403, "FORBIDDEN", "User is not assigned to an organization");
    }

    const { data, error } = await fastify.supabaseService
      .from("goal_templates")
      .insert({
        org_id: parsed.data.orgId ?? orgContext.orgId,
        created_by: userId,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        default_priority: parsed.data.defaultPriority,
        template: parsed.data.template
      })
      .select("id, org_id, created_by, name, description, default_priority, template, created_at, updated_at")
      .single();

    if (error || !data) {
      if (isMissingSchemaCache(error)) {
        return sendApiError(reply, request, 503, "SERVICE_UNAVAILABLE", "Goal template tables are not available yet; apply DB migrations first");
      }
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to save goal template");
    }

    await createSecurityAudit(fastify, request as never, "goal_template_created", "goal_template", data.id as string, { name: parsed.data.name });
    return reply.status(201).send(data);
  });

  fastify.post("/goals/from-template", { preHandler: requireRole("ceo", "cfo") }, async (request, reply) => {
    const parsed = CreateFromTemplateSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid create-from-template payload", {
        details: parsed.error.flatten()
      });
    }

    const userId = request.user?.id;
    if (!userId) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const templateResult = await fastify.supabaseService
      .from("goal_templates")
      .select("*")
      .eq("id", parsed.data.templateId)
      .maybeSingle();

    if (templateResult.error || !templateResult.data) {
      return sendApiError(reply, request, 404, "NOT_FOUND", "Goal template not found");
    }

    const goalPayload = templateResult.data.template as Record<string, unknown>;
    const title = parsed.data.title ?? (typeof goalPayload.title === "string" ? goalPayload.title : templateResult.data.name);
    const description = typeof goalPayload.description === "string" ? goalPayload.description : templateResult.data.description;
    const deadline = parsed.data.deadline ?? (typeof goalPayload.deadline === "string" ? goalPayload.deadline : null);

    const { data, error } = await fastify.supabaseService
      .from("goals")
      .insert({
        created_by: userId,
        title,
        description: description ?? null,
        raw_input: JSON.stringify({ templateId: templateResult.data.id, overrides: parsed.data.overrides ?? {} }),
        status: "active",
        priority: (typeof goalPayload.priority === "string" ? goalPayload.priority : templateResult.data.default_priority) ?? "medium",
        deadline,
        simulation: false
      })
      .select("id")
      .single();

    if (error || !data) {
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to create goal from template");
    }

    await createSecurityAudit(fastify, request as never, "goal_created_from_template", "goal", data.id as string, { templateId: parsed.data.templateId });
    return reply.status(201).send({ goalId: data.id });
  });

  fastify.post("/tasks/:id/timer/start", { preHandler: requireRole("ceo", "cfo", "manager", "worker") }, async (request, reply) => {
    const params = TaskParamSchema.safeParse(request.params);
    if (!params.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid task id", { field: "id" });
    }

    const userId = request.user?.id;
    if (!userId) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const orgContext = await resolveOrgContext(fastify, userId);
    if (!orgContext.orgId) {
      return sendApiError(reply, request, 403, "FORBIDDEN", "User is not assigned to an organization");
    }

    const { data: task, error: taskError } = await fastify.supabaseService
      .from("tasks")
      .select("id, org_id")
      .eq("id", params.data.id)
      .maybeSingle();

    if (taskError || !task || task.org_id !== orgContext.orgId) {
      return sendApiError(reply, request, 404, "NOT_FOUND", "Task not found");
    }

    const startedAt = new Date().toISOString();
    const { data, error } = await fastify.supabaseService
      .from("time_logs")
      .insert({
        org_id: orgContext.orgId,
        task_id: params.data.id,
        user_id: userId,
        source: "timer",
        started_at: startedAt,
        billable: false
      })
      .select("*")
      .single();

    if (error || !data) {
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to start timer");
    }

    await createSecurityAudit(fastify, request as never, "timer_started", "time_log", data.id as string, { taskId: params.data.id });
    return reply.status(201).send(data);
  });

  fastify.post("/tasks/:id/timer/stop", { preHandler: requireRole("ceo", "cfo", "manager", "worker") }, async (request, reply) => {
    const params = TaskParamSchema.safeParse(request.params);
    if (!params.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid task id", { field: "id" });
    }

    const userId = request.user?.id;
    if (!userId) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const { data, error } = await fastify.supabaseService
      .from("time_logs")
      .select("*")
      .eq("task_id", params.data.id)
      .eq("user_id", userId)
      .is("ended_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return sendApiError(reply, request, 404, "NOT_FOUND", "Open timer not found");
    }

    const endedAt = new Date().toISOString();
    const { data: stopped, error: stopError } = await fastify.supabaseService
      .from("time_logs")
      .update({ ended_at: endedAt })
      .eq("id", data.id)
      .select("*")
      .single();

    if (stopError || !stopped) {
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to stop timer");
    }

    await createSecurityAudit(fastify, request as never, "timer_stopped", "time_log", stopped.id as string, { taskId: params.data.id });
    return reply.send(stopped);
  });

  fastify.get("/tasks/:id/time-logs", { preHandler: requireRole("ceo", "cfo", "manager", "worker") }, async (request, reply) => {
    const params = TaskParamSchema.safeParse(request.params);
    if (!params.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid task id", { field: "id" });
    }

    const { data, error } = await fastify.supabaseService
      .from("time_logs")
      .select("id, org_id, task_id, user_id, source, meeting_source, started_at, ended_at, minutes, notes, billable, created_at")
      .eq("task_id", params.data.id)
      .order("started_at", { ascending: false });

    if (error) {
      if (isMissingSchemaCache(error)) {
        return reply.send({ items: [] });
      }
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to load time logs");
    }

    return reply.send({ items: data ?? [] });
  });

  fastify.post("/time-logs", { preHandler: requireRole("ceo", "cfo", "manager", "worker") }, async (request, reply) => {
    const parsed = ManualTimeLogSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid time log payload", { details: parsed.error.flatten() });
    }

    const userId = request.user?.id;
    if (!userId) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const orgContext = await resolveOrgContext(fastify, userId);
    if (!orgContext.orgId) {
      return sendApiError(reply, request, 403, "FORBIDDEN", "User is not assigned to an organization");
    }

    const { data, error } = await fastify.supabaseService
      .from("time_logs")
      .insert({
        org_id: orgContext.orgId,
        task_id: parsed.data.taskId ?? null,
        user_id: parsed.data.userId ?? userId,
        source: parsed.data.source,
        meeting_source: parsed.data.meetingSource ?? null,
        started_at: parsed.data.startedAt,
        ended_at: parsed.data.endedAt ?? null,
        notes: parsed.data.notes ?? null,
        billable: parsed.data.billable
      })
      .select("*")
      .single();

    if (error || !data) {
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to create time log");
    }

    await createSecurityAudit(fastify, request as never, "time_log_created", "time_log", data.id as string, { source: parsed.data.source });
    return reply.status(201).send(data);
  });

  fastify.post("/meetings/import", { preHandler: requireRole("ceo", "cfo", "manager") }, async (request, reply) => {
    const parsed = MeetingImportSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid meeting import payload", { details: parsed.error.flatten() });
    }

    const userId = request.user?.id;
    if (!userId) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const orgContext = await resolveOrgContext(fastify, userId);
    if (!orgContext.orgId) {
      return sendApiError(reply, request, 403, "FORBIDDEN", "User is not assigned to an organization");
    }

    const extractedTasks = parsed.data.rawTranscript
      ? parsed.data.rawTranscript
          .split(/[\n\.]/)
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 20)
          .slice(0, 8)
          .map((entry) => ({ title: summarizeText(entry, 90), description: entry }))
      : [];

    const { data, error } = await fastify.supabaseService
      .from("meeting_ingestions")
      .insert({
        org_id: parsed.data.orgId ?? orgContext.orgId,
        source: parsed.data.source,
        external_id: parsed.data.externalId ?? null,
        subject: parsed.data.subject,
        notes: parsed.data.notes ?? null,
        attendees: parsed.data.attendees,
        tasks_extracted: extractedTasks,
        meeting_at: parsed.data.meetingAt ?? null,
        created_by: userId
      })
      .select("*")
      .single();

    if (error || !data) {
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to import meeting");
    }

      const meetingIngestText = [parsed.data.subject, parsed.data.notes ?? "", parsed.data.rawTranscript ?? ""]
        .filter((value) => value.length > 0)
        .join("\n\n");

      if (meetingIngestText.length > 0) {
        await getIngestQueue().add("meeting_ingest", {
          orgId: data.org_id as string,
          sourceType: "meeting_ingestion",
          sourceId: data.id as string,
          text: meetingIngestText
        });
      }

    await createSecurityAudit(fastify, request as never, "meeting_imported", "meeting_ingestion", data.id as string, { source: parsed.data.source });
    return reply.status(201).send(data);
  });

  fastify.post("/ai/parse-input", { preHandler: requireRole("ceo", "cfo", "manager", "worker") }, async (request, reply) => {
    const parsed = ParseInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid parse input payload", { details: parsed.error.flatten() });
    }

    const result = parseActionFromInput(parsed.data.text);
    return reply.send({
      kind: result.kind,
      title: result.title,
      description: result.description,
      priority: result.priority,
      suggestedTask: result.kind === "task" || result.kind === "goal"
    });
  });

  fastify.post("/ai/ask", { preHandler: requireRole("ceo", "cfo", "manager", "worker") }, async (request, reply) => {
    const parsed = AskSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid AI question payload", { details: parsed.error.flatten() });
    }

    const response = parsed.data.question.toLowerCase().includes("what should i do")
      ? "Focus on the highest-priority blocked work, then clear one dependency at a time."
      : parsed.data.question.toLowerCase().includes("summarize")
        ? `Summary: ${summarizeText(parsed.data.question, 120)}`
        : "I can help turn input into goals, tasks, meeting notes, or next actions.";

    return reply.send({
      answer: response,
      actions: [
        { label: "Create task", href: "/dashboard/capture" },
        { label: "Open inbox", href: "/dashboard/inbox" },
        { label: "Review analytics", href: "/dashboard/analytics" }
      ]
    });
  });

  fastify.post("/integrations", { preHandler: requireRole("ceo", "cfo") }, async (request, reply) => {
    const parsed = IntegrationSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid integration payload", { details: parsed.error.flatten() });
    }

    const userId = request.user?.id;
    if (!userId) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const orgContext = await resolveOrgContext(fastify, userId);
    if (!orgContext.orgId) {
      return sendApiError(reply, request, 403, "FORBIDDEN", "User is not assigned to an organization");
    }

    const { data, error } = await fastify.supabaseService
      .from("integrations")
      .upsert({
        org_id: parsed.data.orgId ?? orgContext.orgId,
        provider: parsed.data.provider,
        status: parsed.data.status,
        config: parsed.data.config,
        updated_at: new Date().toISOString()
      }, { onConflict: "org_id,provider" })
      .select("*")
      .single();

    if (error || !data) {
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to save integration");
    }

    await createSecurityAudit(fastify, request as never, "integration_saved", "integration", data.id as string, { provider: parsed.data.provider });
    return reply.send(data);
  });

  fastify.get("/integrations", { preHandler: requireRole("ceo", "cfo") }, async (request, reply) => {
    const userId = request.user?.id;
    if (!userId) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const orgContext = await resolveOrgContext(fastify, userId);
    if (!orgContext.orgId) {
      return sendApiError(reply, request, 403, "FORBIDDEN", "User is not assigned to an organization");
    }

    const { data, error } = await fastify.supabaseService
      .from("integrations")
      .select("*")
      .eq("org_id", orgContext.orgId)
      .order("updated_at", { ascending: false });

    if (error) {
      if (isMissingSchemaCache(error)) {
        return reply.send({ items: [] });
      }
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to load integrations");
    }

    return reply.send({ items: data ?? [] });
  });

  fastify.post("/webhooks/outbound", { preHandler: requireRole("ceo", "cfo") }, async (request, reply) => {
    const parsed = z.object({
      event: z.string().trim().min(1),
      payload: z.record(z.unknown()).default({})
    }).safeParse(request.body);

    if (!parsed.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid webhook payload", { details: parsed.error.flatten() });
    }

    const userId = request.user?.id;
    if (!userId) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const orgContext = await resolveOrgContext(fastify, userId);
    if (!orgContext.orgId) {
      return sendApiError(reply, request, 403, "FORBIDDEN", "User is not assigned to an organization");
    }

    await createSecurityAudit(fastify, request as never, "outbound_webhook_received", "webhook", null, { event: parsed.data.event });
    return reply.send({ accepted: true, orgId: orgContext.orgId, event: parsed.data.event });
  });

  fastify.post("/custom-fields", { preHandler: requireRole("ceo", "cfo") }, async (request, reply) => {
    const parsed = CustomFieldSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid custom field payload", { details: parsed.error.flatten() });
    }

    const { data, error } = await fastify.supabaseService
      .from("custom_fields")
      .insert({
        org_id: parsed.data.orgId,
        entity_type: parsed.data.entityType,
        field_key: parsed.data.fieldKey,
        label: parsed.data.label,
        field_type: parsed.data.fieldType,
        options: parsed.data.options,
        required: parsed.data.required
      })
      .select("*")
      .single();

    if (error || !data) {
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to create custom field");
    }

    await createSecurityAudit(fastify, request as never, "custom_field_created", "custom_field", data.id as string, { entityType: parsed.data.entityType });
    return reply.status(201).send(data);
  });

  fastify.get("/custom-fields", { preHandler: requireRole("ceo", "cfo", "manager") }, async (request, reply) => {
    const userId = request.user?.id;
    if (!userId) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const orgContext = await resolveOrgContext(fastify, userId);
    if (!orgContext.orgId) {
      return sendApiError(reply, request, 403, "FORBIDDEN", "User is not assigned to an organization");
    }

    const { data, error } = await fastify.supabaseService
      .from("custom_fields")
      .select("*")
      .eq("org_id", orgContext.orgId)
      .order("created_at", { ascending: false });

    if (error) {
      if (isMissingSchemaCache(error)) {
        return reply.send({ items: [] });
      }
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to load custom fields");
    }

    return reply.send({ items: data ?? [] });
  });

  fastify.post("/push/subscribe", { preHandler: requireRole("ceo", "cfo", "manager", "worker") }, async (request, reply) => {
    const parsed = PushSubscriptionSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid push subscription payload", { details: parsed.error.flatten() });
    }

    const userId = request.user?.id;
    if (!userId) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const { data, error } = await fastify.supabaseService
      .from("push_subscriptions")
      .upsert({
        user_id: userId,
        endpoint: parsed.data.endpoint,
        p256dh: parsed.data.p256dh,
        auth: parsed.data.auth,
        metadata: parsed.data.metadata
      }, { onConflict: "user_id,endpoint" })
      .select("*")
      .single();

    if (error || !data) {
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to save push subscription");
    }

    await createSecurityAudit(fastify, request as never, "push_subscription_saved", "push_subscription", data.id as string, {});
    return reply.status(201).send(data);
  });

  fastify.get("/inbox", { preHandler: requireRole("ceo", "cfo", "manager", "worker") }, async (request, reply) => {
    const userId = request.user?.id;
    if (!userId) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const orgContext = await resolveOrgContext(fastify, userId);
    if (!orgContext.orgId) {
      return sendApiError(reply, request, 403, "FORBIDDEN", "User is not assigned to an organization");
    }

    const [tasksResult, meetingResult, auditResult] = await Promise.all([
      fastify.supabaseService.from("tasks").select("id, title, status, priority, assigned_to, deadline, created_at").eq("org_id", orgContext.orgId).eq("assigned_to", userId).in("status", ["pending", "routing", "active", "in_progress", "blocked"]).limit(20),
      fastify.supabaseService.from("meeting_ingestions").select("id, subject, notes, tasks_extracted, created_at").eq("org_id", orgContext.orgId).order("created_at", { ascending: false }).limit(5),
      fastify.supabaseService.from("audit_log").select("id, action, entity, category, severity, created_at").eq("org_id", orgContext.orgId).order("created_at", { ascending: false }).eq("category", "security").limit(10)
    ]);

    return reply.send({
      items: {
        tasks: tasksResult.data ?? [],
        meetings: meetingResult.data ?? [],
        security: auditResult.data ?? []
      }
    });
  });

  fastify.post("/orgs/:orgId/analytics/snapshot", { preHandler: requireRole("ceo", "cfo") }, async (request, reply) => {
    const params = OrgParamSchema.safeParse(request.params);
    if (!params.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid organization id", { field: "orgId" });
    }

    const { data: tasks } = await fastify.supabaseService.from("tasks").select("id, status, estimated_effort_hours, actual_hours").eq("org_id", params.data.orgId);
    const { data: goals } = await fastify.supabaseService.from("goals").select("id, status, priority").in("created_by", request.user?.id ? [request.user.id] : []);
    const snapshot = {
      totalTasks: tasks?.length ?? 0,
      completedTasks: tasks?.filter((task) => task.status === "completed").length ?? 0,
      totalGoals: goals?.length ?? 0,
      highPriorityGoals: goals?.filter((goal) => goal.priority === "high" || goal.priority === "critical").length ?? 0,
      estimatedHours: tasks?.reduce((sum, task) => sum + Number(task.estimated_effort_hours ?? 0), 0) ?? 0,
      actualHours: tasks?.reduce((sum, task) => sum + Number(task.actual_hours ?? 0), 0) ?? 0
    };

    const { data, error } = await fastify.supabaseService
      .from("analytics_snapshots")
      .upsert({ org_id: params.data.orgId, snapshot_date: new Date().toISOString().slice(0, 10), metrics: snapshot }, { onConflict: "org_id,snapshot_date" })
      .select("*")
      .single();

    if (error || !data) {
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to save analytics snapshot");
    }

    await createSecurityAudit(fastify, request as never, "analytics_snapshot_saved", "analytics_snapshot", data.id as string, {});
    return reply.status(201).send(data);
  });

  fastify.get("/orgs/:orgId/billing", { preHandler: requireRole("ceo", "cfo") }, async (request, reply) => {
    const params = OrgParamSchema.safeParse(request.params);
    if (!params.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid organization id", { field: "orgId" });
    }

    const { data, error } = await fastify.supabaseService
      .from("org_billing")
      .select("*")
      .eq("org_id", params.data.orgId)
      .maybeSingle();

    if (error) {
      if (isMissingSchemaCache(error)) {
        return reply.send({ plan: "starter", seat_limit: 25, usage: {} });
      }
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to load billing settings");
    }

    return reply.send(data ?? { plan: "starter", seat_limit: 25, usage: {} });
  });
};

export default expansionRoutes;