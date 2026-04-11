import type { FastifyPluginAsync } from "fastify";
import { sendApiError } from "../lib/errors.js";
import { loadUserProfile } from "../lib/user-profile.js";

const meRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/me", async (request, reply) => {
    if (!request.user) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const profile = await loadUserProfile(fastify, request.user);

    return reply.send(profile);
  });
};

export default meRoutes;
