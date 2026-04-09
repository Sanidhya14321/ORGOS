import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import { sendApiError } from "../lib/errors.js";

const PUBLIC_ROUTES = new Set(["/api/auth/login", "/api/auth/refresh", "/healthz"]);

function normalizePath(url: string): string {
  const parsed = new URL(url, "http://localhost");
  return parsed.pathname;
}

const authPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("onRequest", async (request, reply) => {
    request.user = null;
    request.userRole = null;

    const path = normalizePath(request.url);
    if (PUBLIC_ROUTES.has(path)) {
      return;
    }

    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing bearer token");
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing bearer token");
    }

    const { data, error } = await fastify.supabaseAnon.auth.getUser(token);
    if (error || !data.user) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Invalid or expired token");
    }

    request.user = data.user;
    const metadataRole = data.user.user_metadata?.role;
    request.userRole = typeof metadataRole === "string" ? metadataRole : null;
  });
};

export default fp(authPlugin, {
  name: "auth-plugin"
});
