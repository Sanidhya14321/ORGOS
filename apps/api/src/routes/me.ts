import type { FastifyPluginAsync } from "fastify";
import { sendApiError } from "../lib/errors.js";
import { loadUserProfile } from "../lib/user-profile.js";

const meRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/me", async (request, reply) => {
    if (!request.user) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const profile = await loadUserProfile(fastify, request.user);

    let org_setup:
      | {
          required: boolean;
          positions_complete: boolean;
          company_docs_complete: boolean;
        }
      | undefined;

    if (profile.org_id && profile.role === "ceo") {
      const orgRow = await fastify.supabaseService
        .from("orgs")
        .select("setup_positions_completed_at, setup_company_docs_completed_at")
        .eq("id", profile.org_id)
        .maybeSingle();

      if (!orgRow.error && orgRow.data) {
        const positions_complete = Boolean(orgRow.data.setup_positions_completed_at);
        const company_docs_complete = Boolean(orgRow.data.setup_company_docs_completed_at);
        org_setup = {
          required: !(positions_complete && company_docs_complete),
          positions_complete,
          company_docs_complete
        };
      }
    }

    return reply.send(org_setup ? { ...profile, org_setup } : profile);
  });
};

export default meRoutes;
