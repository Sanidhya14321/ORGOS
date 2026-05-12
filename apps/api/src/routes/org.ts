import crypto from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { sendApiError } from "../lib/errors.js";
import { requireRole } from "../plugins/rbac.js";
import { invalidateOrgPromptCache } from "../services/promptCache.js";
import {
  CompanySizeValues,
  IndustryValues,
  setupOrgForIndustry
} from "../services/orgIndustrySetup.js";

const SearchOrgQuerySchema = z.object({
  q: z.string().trim().min(1).max(120)
});

const CreateOrgBodySchema = z
  .object({
    name: z.string().trim().min(2).max(200),
    domain: z.string().trim().min(1).max(120).optional(),
    industry: z.enum(IndustryValues).default("tech"),
    companySize: z.enum(CompanySizeValues).optional(),
    company_size: z.enum(CompanySizeValues).optional(),
    makeCreatorCeo: z.boolean().default(true)
  })
  .transform((value) => ({
    name: value.name,
    domain: value.domain,
    industry: value.industry,
    companySize: value.companySize ?? value.company_size ?? "startup",
    makeCreatorCeo: value.makeCreatorCeo
  }));

const OrgIdParamSchema = z.object({
  id: z.string().uuid()
});

const OrgStructureSchema = z.enum([
  "hierarchical",
  "functional",
  "flat",
  "divisional",
  "matrix",
  "team",
  "network",
  "process",
  "circular",
  "line"
]);

const OrgSettingsPatchBodySchema = z
  .object({
    orgStructure: OrgStructureSchema.optional(),
    org_structure: OrgStructureSchema.optional()
  })
  .transform((value) => ({
    orgStructure: value.orgStructure ?? value.org_structure
  }));

const LevelSchema = z.coerce.number().int().min(0).max(999);

const PositionBodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  level: LevelSchema,
  createLogin: z.boolean().optional().default(true),
  loginEmail: z.string().trim().email().optional(),
  fullName: z.string().trim().min(1).max(120).optional()
});

const AccountsListQuerySchema = z.object({
  page: z.coerce.number().int().positive().catch(1).default(1),
  limit: z.coerce.number().int().positive().max(100).catch(20).default(20)
});

const MemberParamSchema = z.object({
  id: z.string().uuid()
});

const RejectBodySchema = z.object({
  reason: z.string().trim().min(3).max(400)
});

const ApproveBodySchema = z.object({
  overrideDomainMismatch: z.boolean().optional().default(false)
});

const MemberRoleSchema = z.enum(["ceo", "cfo", "manager", "worker"]);

const MemberStructureBodySchema = z.object({
  role: MemberRoleSchema.optional(),
  positionId: z.string().uuid().nullable().optional(),
  reportsTo: z.string().uuid().nullable().optional(),
  department: z.string().trim().max(120).nullable().optional()
});

const EmployeeImportRowSchema = z.object({
  fullName: z.string().trim().min(1).max(120),
  email: z.string().trim().email(),
  department: z.string().trim().max(120).optional(),
  role: MemberRoleSchema.optional(),
  positionTitle: z.string().trim().max(200).optional(),
  positionLevel: LevelSchema.optional(),
  reportsToEmail: z.string().trim().email().optional(),
  password: z.string().min(8).optional()
});

const AccountParamSchema = z.object({
  id: z.string().uuid()
});

const EmployeeImportBodySchema = z.object({
  employees: z.array(EmployeeImportRowSchema).min(1).max(100)
});

const OrgTreeNodeSchema = z.object({
  id: z.string().uuid(),
  full_name: z.string(),
  email: z.string().email().optional(),
  role: z.enum(["ceo", "cfo", "manager", "worker"]),
  status: z.string().optional(),
  department: z.string().nullable().optional(),
  position_id: z.string().uuid().nullable().optional(),
  reports_to: z.string().uuid().nullable().optional(),
  branch_id: z.string().uuid().nullable().optional(),
  branch_name: z.string().nullable().optional(),
  position_title: z.string().optional(),
  power_level: z.number().int().optional(),
  visibility_scope: z.string().optional(),
  assignment_status: z.string().optional(),
  current_load: z.number().int().optional(),
  max_load: z.number().int().optional()
});

function isMissingTableSchemaCache(error: { code?: string } | null | undefined): boolean {
  return error?.code === "PGRST205";
}

function getEmailDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 0 || at === email.length - 1) {
    return null;
  }
  return email.slice(at + 1).toLowerCase();
}

function inferLevelFromRole(role: z.infer<typeof MemberRoleSchema>): 0 | 1 | 2 {
  if (role === "ceo" || role === "cfo") {
    return 0;
  }

  if (role === "manager") {
    return 1;
  }

  return 2;
}

function deriveRoleFromPosition(position: { title?: string | null; level?: number | null }): "ceo" | "cfo" | "manager" | "worker" {
  const title = (position.title ?? "").toLowerCase();
  if (title.includes("chief financial") || title === "cfo") {
    return "cfo";
  }
  if (title.includes("chief executive") || title === "ceo") {
    return "ceo";
  }
  const level = Number(position.level ?? 2);
  return level <= 1 ? "manager" : "worker";
}

function generatePassword(): string {
  return crypto.randomBytes(9).toString("base64url");
}

function slugify(input: string): string {
  const value = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return value || "position";
}

const orgRoutes: FastifyPluginAsync = async (fastify) => {
  async function getRequesterOrgId(userId: string): Promise<string | null> {
    const requester = await fastify.supabaseService
      .from("users")
      .select("org_id")
      .eq("id", userId)
      .maybeSingle();

    return (requester.data?.org_id as string | null | undefined) ?? null;
  }

  fastify.get("/orgs/search", async (request, reply) => {
    const parsed = SearchOrgQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid org search query", {
        details: parsed.error.flatten()
      });
    }

    const { q } = parsed.data;
    const { data, error } = await fastify.supabaseService
      .from("orgs")
      .select("id, name, domain")
      .ilike("name", `%${q}%`)
      .limit(20);

    if (error) {
      if (isMissingTableSchemaCache(error)) {
        request.log.warn({ err: error }, "orgs table missing in schema cache; returning empty search result");
        return reply.send({ items: [] });
      }
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to search organizations");
    }

    return reply.send({ items: data ?? [] });
  });

  fastify.post("/orgs/create", async (request, reply) => {
    const parsed = CreateOrgBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid org create payload", {
        details: parsed.error.flatten()
      });
    }

    const authUser = request.user;
    if (!authUser?.id) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const { name, domain, industry, companySize, makeCreatorCeo } = parsed.data;

    const requesterProfile = await fastify.supabaseService
      .from("users")
      .select("id")
      .eq("id", authUser.id)
      .maybeSingle();

    const existing = await fastify.supabaseService
      .from("orgs")
      .select("id")
      .eq("name", name)
      .maybeSingle();

    if (existing.data?.id) {
      return sendApiError(reply, request, 409, "CONFLICT", "Organization already exists");
    }

    const createdOrg = await fastify.supabaseService
      .from("orgs")
      .insert({ name, domain, created_by: requesterProfile.data?.id ?? null })
      .select("id, name, domain, created_by")
      .single();

    if (createdOrg.error || !createdOrg.data) {
      if (isMissingTableSchemaCache(createdOrg.error)) {
        return sendApiError(reply, request, 503, "SERVICE_UNAVAILABLE", "Organization tables are not available yet; apply DB migrations first");
      }
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to create organization");
    }

    try {
      await setupOrgForIndustry(fastify, {
        orgId: createdOrg.data.id,
        industry,
        companySize
      });
    } catch (setupError) {
      request.log.error({ err: setupError }, "Industry-specific org setup failed");
      return sendApiError(
        reply,
        request,
        503,
        "SERVICE_UNAVAILABLE",
        "Organization created, but industry setup failed. Apply latest DB migrations and retry org setup."
      );
    }

    const updateUserPayload: Record<string, unknown> = {
      org_id: createdOrg.data.id,
      status: "active"
    };

    if (makeCreatorCeo) {
      updateUserPayload.role = "ceo";
    }

    const userUpdate = await fastify.supabaseService
      .from("users")
      .update(updateUserPayload)
      .eq("id", authUser.id)
      .select("id, email, full_name, role, org_id, status")
      .maybeSingle();

    if (userUpdate.error) {
      request.log.warn({ err: userUpdate.error }, "User org bootstrap update failed after org creation");
    }

    await invalidateOrgPromptCache(fastify, createdOrg.data.id);

    return reply.status(201).send({
      org: createdOrg.data,
      settings: {
        industry,
        company_size: companySize
      },
      user: userUpdate.data ?? null
    });
  });

  fastify.get("/orgs/:id/positions", async (request, reply) => {
    const parsed = OrgIdParamSchema.safeParse(request.params);
    if (!parsed.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid organization id");
    }

    const requesterId = request.user?.id;
    if (!requesterId) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const requesterOrgId = await getRequesterOrgId(requesterId);
    if (!requesterOrgId || requesterOrgId !== parsed.data.id) {
      return sendApiError(reply, request, 403, "FORBIDDEN", "Requester does not belong to this organization");
    }

    const { data, error } = await fastify.supabaseService
      .from("positions")
      .select("id, org_id, title, level, is_custom, confirmed, created_at")
      .eq("org_id", parsed.data.id)
      .order("level", { ascending: true })
      .order("title", { ascending: true });

    if (error) {
      if (isMissingTableSchemaCache(error)) {
        request.log.warn({ err: error }, "positions table missing in schema cache; returning empty list");
        return reply.send({ items: [] });
      }
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to load positions");
    }

    const usersResult = await fastify.supabaseService
      .from("users")
      .select("position_id")
      .eq("org_id", parsed.data.id);

    const filledPositionIds = new Set(
      (usersResult.data ?? [])
        .map((row) => row.position_id as string | null | undefined)
        .filter((positionId): positionId is string => Boolean(positionId))
    );

    return reply.send({
      items: (data ?? []).map((position) => ({
        ...position,
        filled: filledPositionIds.has(position.id as string)
      }))
    });
  });

  // Suggest an organization structure based on current positions and org size
  fastify.post("/orgs/:id/suggest-structure", { preHandler: requireRole("ceo", "cfo") }, async (request, reply) => {
    const parsed = OrgIdParamSchema.safeParse(request.params);
    if (!parsed.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid organization id");
    }

    const requesterId = request.user?.id;
    if (!requesterId) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const requesterOrgId = await getRequesterOrgId(requesterId);
    if (!requesterOrgId || requesterOrgId !== parsed.data.id) {
      return sendApiError(reply, request, 403, "FORBIDDEN", "Requester does not belong to this organization");
    }

    // Load positions and org settings
    const positionsResult = await fastify.supabaseService
      .from("positions")
      .select("id, title, level")
      .eq("org_id", parsed.data.id);

    if (positionsResult.error) {
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to load positions");
    }

    const orgResult = await fastify.supabaseService
      .from("orgs")
      .select("company_size")
      .eq("id", parsed.data.id)
      .maybeSingle();

    const companySize = (orgResult.data?.company_size as string | undefined) ?? "startup";

    const positions = positionsResult.data ?? [];
    const posCount = positions.length;
    const maxLevel = positions.reduce((m: number, p: any) => Math.max(m, Number(p.level ?? 0)), 0);

    // Simple deterministic heuristic
    let suggestion = "hierarchical";
    let reason = "Default to hierarchical.";

    if (companySize === "startup") {
      if (posCount < 15) { suggestion = "flat"; reason = "Small startup with few positions prefers a flat model."; }
      else if (posCount < 50) { suggestion = "team"; reason = "Growing startup — team-based squads fit well."; }
      else { suggestion = "functional"; reason = "Growing headcount suggests functionally organized teams."; }
    } else if (companySize === "mid") {
      if (maxLevel <= 2) { suggestion = "functional"; reason = "Mid-sized org with shallow levels benefits from functional organization."; }
      else { suggestion = "hierarchical"; reason = "Deeper levels suggest hierarchical structure."; }
    } else { // enterprise
      if (posCount > 300) { suggestion = "divisional"; reason = "Large organization with many positions fits divisional or matrix models."; }
      else { suggestion = "matrix"; reason = "Enterprise with cross-cutting programs benefits from matrix model."; }
    }

    return reply.send({ suggested_structure: suggestion, reason, posCount, maxLevel, companySize });
  });

  fastify.get("/orgs/:id/settings", { preHandler: requireRole("ceo", "cfo", "manager") }, async (request, reply) => {
    const parsed = OrgIdParamSchema.safeParse(request.params);
    if (!parsed.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid organization id");
    }

    const requesterId = request.user?.id;
    if (!requesterId) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const requesterOrgId = await getRequesterOrgId(requesterId);
    if (!requesterOrgId || requesterOrgId !== parsed.data.id) {
      return sendApiError(reply, request, 403, "FORBIDDEN", "Requester does not belong to this organization");
    }

    const settingsResult = await fastify.supabaseService
      .from("org_settings")
      .select("org_id, industry, company_size, org_structure")
      .eq("org_id", parsed.data.id)
      .maybeSingle();

    if (settingsResult.error) {
      if (isMissingTableSchemaCache(settingsResult.error)) {
        return reply.send({
          org_id: parsed.data.id,
          industry: "tech",
          company_size: "startup",
          org_structure: "hierarchical"
        });
      }
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to load organization settings");
    }

    return reply.send(
      settingsResult.data ?? {
        org_id: parsed.data.id,
        industry: "tech",
        company_size: "startup",
        org_structure: "hierarchical"
      }
    );
  });

  fastify.patch("/orgs/:id/settings", { preHandler: requireRole("ceo", "cfo") }, async (request, reply) => {
    const params = OrgIdParamSchema.safeParse(request.params);
    const body = OrgSettingsPatchBodySchema.safeParse(request.body);

    if (!params.success || !body.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid organization settings payload", {
        details: {
          params: params.success ? null : params.error.flatten(),
          body: body.success ? null : body.error.flatten()
        }
      });
    }

    const requesterId = request.user?.id;
    if (!requesterId) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const requesterOrgId = await getRequesterOrgId(requesterId);
    if (!requesterOrgId || requesterOrgId !== params.data.id) {
      return sendApiError(reply, request, 403, "FORBIDDEN", "Requester does not belong to this organization");
    }

    if (!body.data.orgStructure) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "No settings changes requested");
    }

    const existingSettings = await fastify.supabaseService
      .from("org_settings")
      .select("org_id, industry, company_size")
      .eq("org_id", params.data.id)
      .maybeSingle();

    if (existingSettings.error && !isMissingTableSchemaCache(existingSettings.error)) {
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to resolve organization settings");
    }

    const baseIndustry = (existingSettings.data?.industry as (typeof IndustryValues)[number] | undefined) ?? "tech";
    const baseCompanySize = (existingSettings.data?.company_size as (typeof CompanySizeValues)[number] | undefined) ?? "startup";

    const upsertResult = await fastify.supabaseService
      .from("org_settings")
      .upsert(
        {
          org_id: params.data.id,
          industry: baseIndustry,
          company_size: baseCompanySize,
          org_structure: body.data.orgStructure
        },
        { onConflict: "org_id" }
      )
      .select("org_id, industry, company_size, org_structure")
      .maybeSingle();

    if (upsertResult.error) {
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to update organization settings", {
        details: upsertResult.error.message
      });
    }

    await invalidateOrgPromptCache(fastify, params.data.id);

    return reply.send(upsertResult.data ?? {
      org_id: params.data.id,
      industry: baseIndustry,
      company_size: baseCompanySize,
      org_structure: body.data.orgStructure
    });
  });

  fastify.get("/orgs/:id/tree", { preHandler: requireRole("ceo", "cfo", "manager", "worker") }, async (request, reply) => {
    const parsed = OrgIdParamSchema.safeParse(request.params);
    if (!parsed.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid organization id");
    }

    const userId = request.user?.id;
    if (!userId) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const requester = await fastify.supabaseService
      .from("users")
      .select("id, org_id, role, position_id")
      .eq("id", userId)
      .maybeSingle();

    if (requester.error) {
      if (isMissingTableSchemaCache(requester.error)) {
        request.log.warn({ err: requester.error }, "users table missing in schema cache; returning empty org tree");
        return reply.send({ orgId: parsed.data.id, nodes: [], positions: [] });
      }
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to resolve requester profile");
    }

    const requesterOrgId = requester.data?.org_id as string | null | undefined;
    if (!requesterOrgId || requesterOrgId !== parsed.data.id) {
      return sendApiError(reply, request, 403, "FORBIDDEN", "Requester does not belong to this organization");
    }
    const positionsResult = await fastify.supabaseService
      .from("positions")
      .select("id, title, level, department, branch_id, reports_to_position_id, power_level, visibility_scope, max_concurrent_tasks, is_custom, confirmed")
      .eq("org_id", parsed.data.id)
      .order("level", { ascending: true })
      .order("title", { ascending: true });

    if (positionsResult.error) {
      if (isMissingTableSchemaCache(positionsResult.error)) {
        request.log.warn({ err: positionsResult.error }, "positions table missing in schema cache; returning empty org tree");
        return reply.send({ orgId: parsed.data.id, nodes: [], positions: [] });
      }
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to load organization positions");
    }

    const usersResult = await fastify.supabaseService
      .from("users")
      .select("id, full_name, email, status, department, position_id, open_task_count")
      .eq("org_id", parsed.data.id);
    if (usersResult.error) {
      if (isMissingTableSchemaCache(usersResult.error)) {
        return reply.send({ orgId: parsed.data.id, nodes: [], positions: [] });
      }
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to load organization members");
    }

    const assignmentsResult = await fastify.supabaseService
      .from("position_assignments")
      .select("position_id, user_id, assignment_status, activation_state, seat_label, invite_email, branch_id")
      .eq("org_id", parsed.data.id)
      .is("deactivated_at", null);
    if (assignmentsResult.error && !isMissingTableSchemaCache(assignmentsResult.error)) {
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to load organization assignments");
    }

    const branchesResult = await fastify.supabaseService
      .from("org_branches")
      .select("id, name")
      .eq("org_id", parsed.data.id);
    if (branchesResult.error && !isMissingTableSchemaCache(branchesResult.error)) {
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to load organization branches");
    }

    const usersByPositionId = new Map<string, {
      id: string;
      full_name: string | null;
      email: string | null;
      status: string | null;
      department: string | null;
      open_task_count: number;
    }>();
    for (const row of usersResult.data ?? []) {
      const positionId = (row.position_id as string | null | undefined) ?? null;
      if (!positionId) {
        continue;
      }
      usersByPositionId.set(positionId, {
        id: String(row.id),
        full_name: (row.full_name as string | null | undefined) ?? null,
        email: (row.email as string | null | undefined) ?? null,
        status: (row.status as string | null | undefined) ?? null,
        department: (row.department as string | null | undefined) ?? null,
        open_task_count: Number(row.open_task_count ?? 0)
      });
    }

    const assignmentsByPositionId = new Map<string, Record<string, unknown>>();
    for (const row of assignmentsResult.data ?? []) {
      assignmentsByPositionId.set(String(row.position_id), row as Record<string, unknown>);
    }

    const branchNamesById = new Map<string, string>();
    for (const row of branchesResult.data ?? []) {
      branchNamesById.set(String(row.id), String(row.name));
    }

    const allNodes = (positionsResult.data ?? [])
      .map((position) => {
        const assignment = assignmentsByPositionId.get(String(position.id));
        const occupant = usersByPositionId.get(String(position.id));
        return OrgTreeNodeSchema.parse({
          id: position.id,
          full_name: occupant?.full_name ?? `${position.title} Seat`,
          email: occupant?.email ?? (assignment?.invite_email as string | undefined),
          role: deriveRoleFromPosition({ title: position.title as string, level: Number(position.level ?? 2) }),
          status: occupant?.status ?? (assignment?.assignment_status as string | undefined) ?? "vacant",
          department: (position.department as string | null | undefined) ?? occupant?.department ?? null,
          position_id: position.id,
          reports_to: (position.reports_to_position_id as string | null | undefined) ?? null,
          branch_id: ((assignment?.branch_id ?? position.branch_id) as string | null | undefined) ?? null,
          branch_name: ((assignment?.branch_id ?? position.branch_id) as string | null | undefined)
            ? branchNamesById.get(String((assignment?.branch_id ?? position.branch_id) as string)) ?? null
            : null,
          position_title: position.title,
          power_level: Number(position.power_level ?? 50),
          visibility_scope: String(position.visibility_scope ?? "org"),
          assignment_status: (assignment?.assignment_status as string | undefined) ?? (occupant ? "active" : "vacant"),
          current_load: occupant?.open_task_count ?? 0,
          max_load: Number(position.max_concurrent_tasks ?? 10)
        });
      });

    const requesterRole = requester.data?.role as string | undefined;
    const requesterPositionId = (requester.data?.position_id as string | null | undefined) ?? null;

    const parentsById = new Map<string, string | null>();
    const childrenByParent = new Map<string, string[]>();
    for (const node of allNodes) {
      parentsById.set(node.id, node.reports_to ?? null);
      if (!node.reports_to) {
        continue;
      }
      const list = childrenByParent.get(node.reports_to) ?? [];
      list.push(node.id);
      childrenByParent.set(node.reports_to, list);
    }

    const visiblePositionIds = new Set<string>();
    if (requesterRole === "ceo" || requesterRole === "cfo" || !requesterPositionId) {
      for (const node of allNodes) {
        visiblePositionIds.add(node.id);
      }
    } else {
      let cursor: string | null = requesterPositionId;
      while (cursor) {
        visiblePositionIds.add(cursor);
        cursor = parentsById.get(cursor) ?? null;
      }

      if (requesterRole === "manager") {
        const stack = [requesterPositionId];
        while (stack.length > 0) {
          const current = stack.pop() as string;
          visiblePositionIds.add(current);
          const children = childrenByParent.get(current) ?? [];
          for (const child of children) {
            stack.push(child);
          }
        }
      }
    }

    const nodes = allNodes.filter((node) => visiblePositionIds.has(node.id));
    const positionsWithFilled = (positionsResult.data ?? [])
      .filter((position) => visiblePositionIds.has(String(position.id)))
      .map((pos: any) => ({
        id: pos.id,
        title: pos.title,
        level: pos.level,
        power_level: Number(pos.power_level ?? 50),
        is_custom: pos.is_custom,
        confirmed: pos.confirmed,
        filled: Boolean(usersByPositionId.get(String(pos.id)))
      }));

    return reply.send({
      orgId: parsed.data.id,
      nodes,
      positions: positionsWithFilled
    });
  });

  fastify.get("/orgs/:id/accounts", { preHandler: requireRole("ceo", "cfo") }, async (request, reply) => {
    const params = OrgIdParamSchema.safeParse(request.params);
    const query = AccountsListQuerySchema.safeParse(request.query);

    if (!params.success || !query.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid account list request payload");
    }

    const requesterId = request.user?.id;
    if (!requesterId) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const requesterOrgId = await getRequesterOrgId(requesterId);
    if (!requesterOrgId || requesterOrgId !== params.data.id) {
      return sendApiError(reply, request, 403, "FORBIDDEN", "Cannot read accounts outside requester organization");
    }

    const from = (query.data.page - 1) * query.data.limit;
    const to = from + query.data.limit - 1;

    const usersResult = await fastify.supabaseService
      .from("users")
      .select("id, email, full_name, role, status, department, position_id, reports_to, created_at", { count: "exact" })
      .eq("org_id", params.data.id)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (usersResult.error) {
      if (isMissingTableSchemaCache(usersResult.error)) {
        return reply.send({ page: query.data.page, limit: query.data.limit, total: 0, items: [] });
      }
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to load organization accounts");
    }

    const positionsResult = await fastify.supabaseService
      .from("positions")
      .select("id, title, level")
      .eq("org_id", params.data.id);

    const positionById = new Map<string, { title: string; level: number }>();
    for (const row of positionsResult.data ?? []) {
      positionById.set(row.id as string, { title: row.title as string, level: Number(row.level) });
    }

    const items = (usersResult.data ?? []).map((row) => {
      const positionId = (row.position_id as string | null | undefined) ?? null;
      const position = positionId ? positionById.get(positionId) : null;
      return {
        id: row.id,
        email: row.email,
        full_name: row.full_name,
        role: row.role,
        status: row.status,
        department: row.department,
        reports_to: row.reports_to,
        position_id: positionId,
        position_title: position?.title ?? null,
        position_level: position?.level ?? null,
        password: null,
        password_note: "Existing passwords are never retrievable. Use password reset to generate a new temporary password."
      };
    });

    return reply.send({
      page: query.data.page,
      limit: query.data.limit,
      total: usersResult.count ?? 0,
      items
    });
  });

  fastify.post("/orgs/accounts/:id/reset-password", { preHandler: requireRole("ceo", "cfo") }, async (request, reply) => {
    const params = AccountParamSchema.safeParse(request.params);
    if (!params.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid account id");
    }

    const requesterId = request.user?.id;
    if (!requesterId) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const requesterOrgId = await getRequesterOrgId(requesterId);
    if (!requesterOrgId) {
      return sendApiError(reply, request, 403, "FORBIDDEN", "Requester is not assigned to an organization");
    }

    const targetUser = await fastify.supabaseService
      .from("users")
      .select("id, email, org_id")
      .eq("id", params.data.id)
      .maybeSingle();

    if (targetUser.error || !targetUser.data?.id) {
      return sendApiError(reply, request, 404, "NOT_FOUND", "Account not found");
    }

    if (targetUser.data.org_id !== requesterOrgId) {
      return sendApiError(reply, request, 403, "FORBIDDEN", "Cannot reset password for account outside requester organization");
    }

    const temporaryPassword = generatePassword();
    const updated = await fastify.supabaseService.auth.admin.updateUserById(params.data.id, {
      password: temporaryPassword,
      email_confirm: true
    });

    if (updated.error) {
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to reset account password");
    }

    await fastify.supabaseService.from("audit_log").insert({
      org_id: requesterOrgId,
      actor_id: requesterId,
      action: "account_password_reset",
      entity: "user",
      entity_id: params.data.id,
      meta: {
        email: targetUser.data.email
      }
    });

    return reply.send({
      id: params.data.id,
      email: targetUser.data.email,
      password: temporaryPassword,
      message: "Temporary password generated. Share securely and rotate after first login."
    });
  });

  fastify.post("/orgs/:id/positions", { preHandler: requireRole("ceo", "cfo") }, async (request, reply) => {
    const params = OrgIdParamSchema.safeParse(request.params);
    const body = PositionBodySchema.safeParse(request.body);

    if (!params.success || !body.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid custom position payload");
    }

    const requesterId = request.user?.id;
    if (!requesterId) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const requesterOrgId = await getRequesterOrgId(requesterId);
    if (!requesterOrgId || requesterOrgId !== params.data.id) {
      return sendApiError(reply, request, 403, "FORBIDDEN", "Cannot create position outside requester organization");
    }

    const { data, error } = await fastify.supabaseService
      .from("positions")
      .insert({
        org_id: params.data.id,
        title: body.data.title,
        level: body.data.level,
        is_custom: true,
        confirmed: false
      })
      .select("id, org_id, title, level, is_custom, confirmed")
      .single();

    if (error) {
      if (isMissingTableSchemaCache(error)) {
        return sendApiError(reply, request, 503, "SERVICE_UNAVAILABLE", "Position tables are not available yet; apply DB migrations first");
      }
      if (error.code === "23505") {
        return sendApiError(reply, request, 409, "CONFLICT", "Position already exists");
      }
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to create custom position");
    }

    let credentials: { email: string; password: string; role: "ceo" | "cfo" | "manager" | "worker" } | null = null;
    if (body.data.createLogin) {
      const orgResult = await fastify.supabaseService
        .from("orgs")
        .select("id, name, domain")
        .eq("id", params.data.id)
        .maybeSingle();

      if (orgResult.error || !orgResult.data?.id) {
        return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Position created but failed to resolve organization for login provisioning");
      }

      const fallbackDomain = `${slugify(orgResult.data.name)}.orgos.ai`;
      const domain = (orgResult.data.domain || fallbackDomain).toLowerCase();
      const emailPrefix = `${slugify(body.data.title)}.${crypto.randomBytes(3).toString("hex")}`;
      const email = (body.data.loginEmail?.toLowerCase() || `${emailPrefix}@${domain}`);
      const password = generatePassword();
      const role: "ceo" | "cfo" | "manager" | "worker" = body.data.level === 0 ? "cfo" : body.data.level === 1 ? "manager" : "worker";
      const fullName = body.data.fullName || `${body.data.title} Seat`;

      const existing = await fastify.supabaseService.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (existing.error) {
        return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Position created but failed to validate login uniqueness");
      }

      const alreadyExists = existing.data.users.some((user) => user.email?.toLowerCase() === email);
      if (alreadyExists) {
        return sendApiError(reply, request, 409, "CONFLICT", "Position created, but generated login email already exists. Retry with a custom loginEmail");
      }

      const createdAuthUser = await fastify.supabaseService.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          role,
          department: null,
          agent_enabled: true
        }
      });

      if (createdAuthUser.error || !createdAuthUser.data.user?.id) {
        return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Position created but failed to provision login credentials");
      }

      const profileUpsert = await fastify.supabaseService
        .from("users")
        .upsert({
          id: createdAuthUser.data.user.id,
          email,
          full_name: fullName,
          role,
          status: "active",
          org_id: params.data.id,
          position_id: data.id,
          department: null,
          reports_to: null
        }, { onConflict: "id" });

      if (profileUpsert.error) {
        return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Position created but failed to persist provisioned member profile");
      }

      credentials = { email, password, role };
    }

    return reply.status(201).send({ ...data, credentials });
  });

  fastify.patch("/orgs/members/:id/structure", { preHandler: requireRole("ceo", "cfo", "manager") }, async (request, reply) => {
    const params = MemberParamSchema.safeParse(request.params);
    const body = MemberStructureBodySchema.safeParse(request.body);

    if (!params.success || !body.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid member structure payload");
    }

    const requesterId = request.user?.id;
    if (!requesterId) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const requesterOrgId = await getRequesterOrgId(requesterId);
    if (!requesterOrgId) {
      return sendApiError(reply, request, 403, "FORBIDDEN", "Requester is not assigned to an organization");
    }

    const targetUser = await fastify.supabaseService
      .from("users")
      .select("id, org_id, role")
      .eq("id", params.data.id)
      .maybeSingle();

    if (targetUser.error) {
      if (isMissingTableSchemaCache(targetUser.error)) {
        return sendApiError(reply, request, 503, "SERVICE_UNAVAILABLE", "User table is not available yet; apply DB migrations first");
      }
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to load target member");
    }

    if (!targetUser.data?.org_id || targetUser.data.org_id !== requesterOrgId) {
      return sendApiError(reply, request, 403, "FORBIDDEN", "Cannot update member outside requester organization");
    }

    const patch: Record<string, unknown> = {};
    if (body.data.department !== undefined) {
      patch.department = body.data.department;
    }
    if (body.data.positionId !== undefined) {
      if (body.data.positionId === null) {
        patch.position_id = null;
      } else {
        const position = await fastify.supabaseService
          .from("positions")
          .select("id, org_id")
          .eq("id", body.data.positionId)
          .maybeSingle();

        if (position.error) {
          return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to resolve position");
        }

        if (!position.data?.id || position.data.org_id !== requesterOrgId) {
          return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Selected position does not belong to this organization");
        }

        patch.position_id = position.data.id;
      }
    }
    if (body.data.reportsTo !== undefined) {
      if (body.data.reportsTo === null) {
        patch.reports_to = null;
      } else if (body.data.reportsTo === params.data.id) {
        return sendApiError(reply, request, 400, "VALIDATION_ERROR", "A member cannot report to themselves");
      } else {
        const manager = await fastify.supabaseService
          .from("users")
          .select("id, org_id")
          .eq("id", body.data.reportsTo)
          .maybeSingle();

        if (manager.error) {
          return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to resolve reporting line");
        }

        if (!manager.data?.id || manager.data.org_id !== requesterOrgId) {
          return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Reporting manager must belong to the same organization");
        }

        patch.reports_to = manager.data.id;
      }
    }
    if (body.data.role) {
      const requesterRole = request.userRole;
      if (requesterRole !== "ceo" && requesterRole !== "cfo") {
        return sendApiError(reply, request, 403, "FORBIDDEN", "Only CEO or CFO can change employee roles");
      }

      patch.role = body.data.role;
      if (body.data.role === "manager" || body.data.role === "worker") {
        patch.status = "active";
      }
    }

    if (Object.keys(patch).length === 0) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "No changes requested");
    }

    const updated = await fastify.supabaseService
      .from("users")
      .update(patch)
      .eq("id", params.data.id)
      .select("id, email, full_name, role, org_id, status, position_id, reports_to, department")
      .maybeSingle();

    if (updated.error || !updated.data) {
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to update member structure");
    }

    await invalidateOrgPromptCache(fastify, requesterOrgId);

    return reply.send(updated.data);
  });

  fastify.post("/orgs/:id/employees/import", { preHandler: requireRole("ceo", "cfo") }, async (request, reply) => {
    const params = OrgIdParamSchema.safeParse(request.params);
    const body = EmployeeImportBodySchema.safeParse(request.body);

    if (!params.success || !body.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid employee import payload");
    }

    const requesterId = request.user?.id;
    if (!requesterId) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const requesterOrgId = await getRequesterOrgId(requesterId);
    if (!requesterOrgId || requesterOrgId !== params.data.id) {
      return sendApiError(reply, request, 403, "FORBIDDEN", "Cannot import employees outside requester organization");
    }

    const positionsResult = await fastify.supabaseService
      .from("positions")
      .select("id, title, level")
      .eq("org_id", params.data.id);

    if (positionsResult.error) {
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to load organization positions for import");
    }

    const existingPositions = positionsResult.data ?? [];
    const positionByKey = new Map<string, { id: string; title: string; level: number }>();
    for (const position of existingPositions) {
      positionByKey.set(`${position.title.toLowerCase()}::${position.level}`, position);
    }

    const authUsers = await fastify.supabaseService.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (authUsers.error) {
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to list existing auth users");
    }

    const authByEmail = new Map<string, string>();
    for (const user of authUsers.data.users) {
      if (user.email) {
        authByEmail.set(user.email.toLowerCase(), user.id);
      }
    }

    const createdCredentials: Array<{ fullName: string; email: string; password: string; role: string; position: string }> = [];
    const reportToLinks: Array<{ id: string; reportsToEmail: string }> = [];

    for (const row of body.data.employees) {
      const email = row.email.toLowerCase();
      const role = row.role ?? "worker";
      const password = row.password ?? generatePassword();
      const level = row.positionLevel ?? inferLevelFromRole(role);
      const title = row.positionTitle?.trim() || (role === "ceo" ? "CEO" : role === "cfo" ? "CFO" : role === "manager" ? "Manager" : "Individual Contributor");
      const positionKey = `${title.toLowerCase()}::${level}`;

      let position = positionByKey.get(positionKey);
      if (!position) {
        const createdPosition = await fastify.supabaseService
          .from("positions")
          .insert({
            org_id: params.data.id,
            title,
            level,
            is_custom: true,
            confirmed: true
          })
          .select("id, title, level")
          .single();

        if (createdPosition.error || !createdPosition.data) {
          return sendApiError(reply, request, 500, "INTERNAL_ERROR", `Failed to create position for ${email}`);
        }

        position = createdPosition.data;
        positionByKey.set(positionKey, position);
      }

      const existingAuthId = authByEmail.get(email);
      if (existingAuthId) {
        const updated = await fastify.supabaseService.auth.admin.updateUserById(existingAuthId, {
          password,
          email_confirm: true,
          user_metadata: {
            full_name: row.fullName,
            role,
            department: row.department,
            agent_enabled: true
          }
        });

        if (updated.error) {
          return sendApiError(reply, request, 500, "INTERNAL_ERROR", `Failed to update auth user for ${email}`);
        }
      } else {
        const created = await fastify.supabaseService.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            full_name: row.fullName,
            role,
            department: row.department,
            agent_enabled: true
          }
        });

        if (created.error || !created.data.user) {
          return sendApiError(reply, request, 500, "INTERNAL_ERROR", `Failed to create auth user for ${email}`);
        }

        authByEmail.set(email, created.data.user.id);
      }

      const authId = authByEmail.get(email);
      if (!authId) {
        return sendApiError(reply, request, 500, "INTERNAL_ERROR", `Unable to resolve auth user for ${email}`);
      }

      const profileUpdate = await fastify.supabaseService
        .from("users")
        .upsert(
          {
            id: authId,
            email,
            full_name: row.fullName,
            role,
            status: "active",
            org_id: params.data.id,
            position_id: position.id,
            department: row.department ?? null
          },
          { onConflict: "id" }
        )
        .select("id")
        .maybeSingle();

      if (profileUpdate.error) {
        return sendApiError(reply, request, 500, "INTERNAL_ERROR", `Failed to persist profile for ${email}`);
      }

      createdCredentials.push({
        fullName: row.fullName,
        email,
        password,
        role,
        position: position.title
      });

      if (row.reportsToEmail) {
        reportToLinks.push({ id: authId, reportsToEmail: row.reportsToEmail.toLowerCase() });
      }
    }

    for (const link of reportToLinks) {
      const reportsToId = authByEmail.get(link.reportsToEmail);
      if (!reportsToId) {
        continue;
      }

      await fastify.supabaseService
        .from("users")
        .update({ reports_to: reportsToId })
        .eq("id", link.id);
    }

    await invalidateOrgPromptCache(fastify, params.data.id);

    return reply.status(201).send({
      imported: createdCredentials.length,
      credentials: createdCredentials
    });
  });

  fastify.get("/orgs/pending-members", { preHandler: requireRole("ceo", "cfo") }, async (request, reply) => {
    const userId = request.user?.id;
    if (!userId) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const userRow = await fastify.supabaseService
      .from("users")
      .select("org_id")
      .eq("id", userId)
      .maybeSingle();

    const orgId = userRow.data?.org_id;
    if (!orgId) {
      return reply.send({ items: [] });
    }

    const pending = await fastify.supabaseService
      .from("users")
      .select("id, email, full_name, position_id, reports_to, status, created_at")
      .eq("org_id", orgId)
      .eq("status", "pending")
      .order("created_at", { ascending: true });

    if (pending.error) {
      if (isMissingTableSchemaCache(pending.error)) {
        request.log.warn({ err: pending.error }, "users table missing org/status columns in schema cache; returning empty list");
        return reply.send({ items: [] });
      }
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to load pending members");
    }

    return reply.send({ items: pending.data ?? [] });
  });

  fastify.post("/orgs/members/:id/approve", { preHandler: requireRole("ceo", "cfo") }, async (request, reply) => {
    const parsed = MemberParamSchema.safeParse(request.params);
    const body = ApproveBodySchema.safeParse(request.body ?? {});
    if (!parsed.success || !body.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid member id");
    }

    const requesterId = request.user?.id;
    if (!requesterId) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const requesterOrgId = await getRequesterOrgId(requesterId);
    if (!requesterOrgId) {
      return sendApiError(reply, request, 403, "FORBIDDEN", "Requester is not assigned to an organization");
    }

    const requester = await fastify.supabaseService
      .from("users")
      .select("id, role")
      .eq("id", requesterId)
      .maybeSingle();

    const targetUser = await fastify.supabaseService
      .from("users")
      .select("id, org_id, status, email")
      .eq("id", parsed.data.id)
      .maybeSingle();

    const org = await fastify.supabaseService
      .from("orgs")
      .select("id, domain")
      .eq("id", requesterOrgId)
      .maybeSingle();

    const targetOrgId = (targetUser.data?.org_id as string | null | undefined) ?? null;
    if (!targetOrgId || targetOrgId !== requesterOrgId) {
      return sendApiError(reply, request, 403, "FORBIDDEN", "Cannot approve member outside requester organization");
    }

    if (targetUser.data?.status !== "pending") {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Only pending members can be approved");
    }

    const orgDomain = typeof org.data?.domain === "string" ? org.data.domain.trim().toLowerCase() : "";
    const emailDomain = typeof targetUser.data?.email === "string" ? getEmailDomain(targetUser.data.email) : null;
    const domainMismatch = !!orgDomain && !!emailDomain && emailDomain !== orgDomain;

    if (domainMismatch) {
      const requesterRole = requester.data?.role;
      const overrideAllowed = requesterRole === "ceo" && body.data.overrideDomainMismatch;
      if (!overrideAllowed) {
        return sendApiError(
          reply,
          request,
          400,
          "VALIDATION_ERROR",
          "User email domain does not match organization domain; CEO override is required"
        );
      }
    }

    const updated = await fastify.supabaseService
      .from("users")
      .update({ status: "active" })
      .eq("id", parsed.data.id)
      .select("id, status")
      .maybeSingle();

    if (updated.error || !updated.data) {
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to approve member");
    }

    if (domainMismatch) {
      await fastify.supabaseService.from("audit_log").insert({
        org_id: requesterOrgId,
        actor_id: requesterId,
        action: "member_domain_override",
        entity: "user",
        entity_id: parsed.data.id,
        meta: {
          orgDomain,
          emailDomain,
          overrideDomainMismatch: true
        }
      });
    }

    await invalidateOrgPromptCache(fastify, requesterOrgId);

    return reply.send(updated.data);
  });

  fastify.post("/orgs/members/:id/reject", { preHandler: requireRole("ceo", "cfo") }, async (request, reply) => {
    const params = MemberParamSchema.safeParse(request.params);
    const body = RejectBodySchema.safeParse(request.body);

    if (!params.success || !body.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid reject payload");
    }

    const requesterId = request.user?.id;
    if (!requesterId) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const requesterOrgId = await getRequesterOrgId(requesterId);
    if (!requesterOrgId) {
      return sendApiError(reply, request, 403, "FORBIDDEN", "Requester is not assigned to an organization");
    }

    const targetUser = await fastify.supabaseService
      .from("users")
      .select("id, org_id")
      .eq("id", params.data.id)
      .maybeSingle();

    const targetOrgId = (targetUser.data?.org_id as string | null | undefined) ?? null;
    if (!targetOrgId || targetOrgId !== requesterOrgId) {
      return sendApiError(reply, request, 403, "FORBIDDEN", "Cannot reject member outside requester organization");
    }

    const updated = await fastify.supabaseService
      .from("users")
      .update({ status: "rejected" })
      .eq("id", params.data.id)
      .select("id, status")
      .maybeSingle();

    if (updated.error || !updated.data) {
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to reject member");
    }

    await fastify.supabaseService.from("audit_log").insert({
      org_id: requesterOrgId,
      actor_id: request.user?.id ?? null,
      action: "member_rejected",
      entity: "user",
      entity_id: params.data.id,
      meta: { reason: body.data.reason }
    });

    await invalidateOrgPromptCache(fastify, requesterOrgId);

    return reply.send(updated.data);
  });
};

export default orgRoutes;
