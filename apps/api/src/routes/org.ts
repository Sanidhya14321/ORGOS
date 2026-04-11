import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { sendApiError } from "../lib/errors.js";
import { requireRole } from "../plugins/rbac.js";

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

function isMissingTableSchemaCache(error: { code?: string } | null | undefined): boolean {
  return error?.code === "PGRST205";
}

const orgRoutes: FastifyPluginAsync = async (fastify) => {
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

  fastify.post("/orgs/:id/positions", async (request, reply) => {
    const params = OrgIdParamSchema.safeParse(request.params);
    const body = PositionBodySchema.safeParse(request.body);

    if (!params.success || !body.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid custom position payload");
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
    if (!parsed.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid member id");
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

    return reply.send(updated.data);
  });

  fastify.post("/orgs/members/:id/reject", { preHandler: requireRole("ceo", "cfo") }, async (request, reply) => {
    const params = MemberParamSchema.safeParse(request.params);
    const body = RejectBodySchema.safeParse(request.body);

    if (!params.success || !body.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid reject payload");
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
      org_id: null,
      actor_id: request.user?.id ?? null,
      action: "member_rejected",
      entity: "user",
      entity_id: params.data.id,
      meta: { reason: body.data.reason }
    });

    return reply.send(updated.data);
  });
};

export default orgRoutes;
