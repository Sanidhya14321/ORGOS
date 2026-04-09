import type { FastifyPluginAsync } from "fastify";
import { sendApiError } from "../lib/errors.js";

const meRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/me", async (request, reply) => {
    if (!request.user) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const { data, error } = await fastify.supabaseService
      .from("users")
      .select("id, email, full_name, role, department, skills, agent_enabled, open_task_count")
      .eq("id", request.user.id)
      .maybeSingle();

    if (error || !data) {
      request.log.error({ err: error }, "Failed to load /me profile");
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Unable to load profile");
    }

    return reply.send(data);
  });
};

export default meRoutes;
