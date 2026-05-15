import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { sendApiError } from "../lib/errors.js";
import { requireRole } from "../plugins/rbac.js";
import { resolveProposalReviewerId } from "../services/orgGraph.js";
import { triggerGoalDecomposition } from "../services/goalDecomposition.js";

const CreateProposalSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(4000).optional(),
  raw_input: z.string().max(8000).optional(),
  target_departments: z.array(z.string().trim().min(1).max(120)).max(20).default([])
});

const goalProposalsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post("/goal-proposals", { preHandler: requireRole("manager", "cfo", "ceo") }, async (request, reply) => {
    const parsed = CreateProposalSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid payload");
    }

    const userId = request.user?.id;
    if (!userId || !request.userOrgId) {
      return sendApiError(reply, request, 403, "FORBIDDEN", "Organization required");
    }

    if (request.assertOrgAccess) {
      await request.assertOrgAccess(request.userOrgId);
      if (reply.sent) {
        return;
      }
    }

    const reviewerId = await resolveProposalReviewerId(fastify.supabaseService, userId);

    const { data, error } = await fastify.supabaseService
      .from("goal_proposals")
      .insert({
        org_id: request.userOrgId,
        created_by: userId,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        raw_input: parsed.data.raw_input ?? null,
        target_departments: parsed.data.target_departments,
        status: "pending",
        current_reviewer_id: reviewerId
      })
      .select("id")
      .single();

    if (error || !data) {
      request.log.warn({ err: error }, "goal_proposals insert failed — apply migration 019_goal_proposals.sql if missing");
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Could not create proposal");
    }

    return reply.status(201).send({ id: data.id, reviewer_id: reviewerId });
  });

  fastify.post("/goal-proposals/:id/approve", { preHandler: requireRole("ceo", "cfo") }, async (request, reply) => {
    const id = z.string().uuid().safeParse((request.params as { id?: string }).id);
    if (!id.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid proposal id");
    }

    const { data: proposal, error } = await fastify.supabaseService
      .from("goal_proposals")
      .select("id, org_id, title, description, raw_input, status, current_reviewer_id")
      .eq("id", id.data)
      .maybeSingle();

    if (error || !proposal) {
      return sendApiError(reply, request, 404, "NOT_FOUND", "Proposal not found");
    }

    if (request.assertOrgAccess) {
      await request.assertOrgAccess(String(proposal.org_id));
      if (reply.sent) {
        return;
      }
    } else if (request.userOrgId !== proposal.org_id) {
      return sendApiError(reply, request, 403, "FORBIDDEN", "Cannot access other organization data");
    }

    if (proposal.status !== "pending") {
      return sendApiError(reply, request, 409, "CONFLICT", "Proposal is not pending");
    }

    const creatorId = request.user?.id;
    if (!creatorId) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const goalInsert = await fastify.supabaseService
      .from("goals")
      .insert({
        org_id: proposal.org_id,
        created_by: creatorId,
        title: proposal.title,
        description: proposal.description ?? proposal.raw_input ?? null,
        raw_input: (proposal.raw_input as string) ?? proposal.title,
        status: "active",
        priority: "medium",
        simulation: false
      })
      .select("id")
      .single();

    if (goalInsert.error || !goalInsert.data) {
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to create goal from proposal");
    }

    const goalId = goalInsert.data.id as string;

    await fastify.supabaseService
      .from("goal_proposals")
      .update({
        status: "approved",
        approved_goal_id: goalId,
        updated_at: new Date().toISOString()
      })
      .eq("id", proposal.id);

    await triggerGoalDecomposition(fastify, goalId);

    return reply.send({ goal_id: goalId });
  });
};

export default goalProposalsRoutes;
