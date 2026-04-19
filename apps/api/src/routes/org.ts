import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { sendApiError } from "../lib/errors.js";
import { requireRole } from "../plugins/rbac.js";
import { invalidateOrgPromptCache } from "../services/promptCache.js";

const SearchOrgQuerySchema = z.object({
  q: z.string().trim().min(1).max(120)
});

const CreateOrgBodySchema = z.object({
  name: z.string().trim().min(2).max(200),
  domain: z.string().trim().min(1).max(120).optional(),
  makeCreatorCeo: z.boolean().default(true)
});

const OrgIdParamSchema = z.object({
  id: z.string().uuid()
});

const PositionBodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  level: z.union([z.literal(0), z.literal(1), z.literal(2)])
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

const OrgTreeNodeSchema = z.object({
  id: z.string().uuid(),
  full_name: z.string(),
  email: z.string().email().optional(),
  role: z.enum(["ceo", "cfo", "manager", "worker"]),
  status: z.enum(["pending", "active", "rejected"]).optional(),
  department: z.string().nullable().optional(),
  position_id: z.string().uuid().nullable().optional(),
  reports_to: z.string().uuid().nullable().optional()
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

    const { name, domain, makeCreatorCeo } = parsed.data;

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
      .insert({ name, domain, created_by: authUser.id })
      .select("id, name, domain, created_by")
      .single();

    if (createdOrg.error || !createdOrg.data) {
      if (isMissingTableSchemaCache(createdOrg.error)) {
        return sendApiError(reply, request, 503, "SERVICE_UNAVAILABLE", "Organization tables are not available yet; apply DB migrations first");
      }
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to create organization");
    }

    // Seed a minimal position set for immediate onboarding.
    await fastify.supabaseService.from("positions").insert([
      { org_id: createdOrg.data.id, title: "CEO", level: 0, is_custom: false, confirmed: true },
      { org_id: createdOrg.data.id, title: "Manager", level: 1, is_custom: false, confirmed: true },
      { org_id: createdOrg.data.id, title: "Individual Contributor", level: 2, is_custom: false, confirmed: true }
    ]);

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
      user: userUpdate.data ?? null
    });
  });

  fastify.get("/orgs/:id/positions", async (request, reply) => {
    const parsed = OrgIdParamSchema.safeParse(request.params);
    if (!parsed.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid organization id");
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

    return reply.send({ items: data ?? [] });
  });

  fastify.get("/orgs/:id/tree", { preHandler: requireRole("ceo", "cfo", "manager") }, async (request, reply) => {
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
      .select("id, org_id, role")
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
    const requesterRole = requester.data?.role as string | undefined;

    const usersResult = await fastify.supabaseService
      .from("users")
      .select("id, full_name, email, role, status, department, position_id, reports_to")
      .eq("org_id", parsed.data.id)
      .order("full_name", { ascending: true });

    if (usersResult.error) {
      if (isMissingTableSchemaCache(usersResult.error)) {
        request.log.warn({ err: usersResult.error }, "users table missing in schema cache; returning empty org tree");
        return reply.send({ orgId: parsed.data.id, nodes: [], positions: [] });
      }
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to load organization tree");
    }

    const positionsResult = await fastify.supabaseService
      .from("positions")
      .select("id, title, level, is_custom, confirmed")
      .eq("org_id", parsed.data.id)
      .order("level", { ascending: true })
      .order("title", { ascending: true });

    if (positionsResult.error) {
      if (isMissingTableSchemaCache(positionsResult.error)) {
        request.log.warn({ err: positionsResult.error }, "positions table missing in schema cache; returning org tree without positions");
        const nodes = (usersResult.data ?? [])
          .map((row) => OrgTreeNodeSchema.safeParse(row))
          .filter((result) => result.success)
          .map((result) => result.data);

        return reply.send({
          orgId: parsed.data.id,
          nodes,
          positions: []
        });
      }
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to load organization positions");
    }

    const allNodes = (usersResult.data ?? [])
      .map((row) => OrgTreeNodeSchema.safeParse(row))
      .filter((result) => result.success)
      .map((result) => result.data);

    // Managers can only view their own reporting subtree, while C-suite can view the full org.
    const nodes = requesterRole === "manager"
      ? (() => {
          const childrenByManager = new Map<string, string[]>();
          for (const node of allNodes) {
            if (!node.reports_to) {
              continue;
            }
            const list = childrenByManager.get(node.reports_to) ?? [];
            list.push(node.id);
            childrenByManager.set(node.reports_to, list);
          }

          const visible = new Set<string>();
          const stack: string[] = [userId];
          while (stack.length > 0) {
            const current = stack.pop() as string;
            if (visible.has(current)) {
              continue;
            }
            visible.add(current);
            const children = childrenByManager.get(current) ?? [];
            for (const child of children) {
              stack.push(child);
            }
          }

          return allNodes.filter((node) => visible.has(node.id));
        })()
      : allNodes;

    return reply.send({
      orgId: parsed.data.id,
      nodes,
      positions: positionsResult.data ?? []
    });
  });

  fastify.post("/orgs/:id/positions", { preHandler: requireRole("ceo", "cfo", "manager") }, async (request, reply) => {
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

    return reply.status(201).send(data);
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
