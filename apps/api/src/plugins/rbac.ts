import type { FastifyReply, FastifyRequest } from "fastify";
import { sendApiError } from "../lib/errors.js";

export function requireRole(...roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const actualRole = request.userRole;
    if (!actualRole || !roles.includes(actualRole)) {
      return sendApiError(reply, request, 403, "FORBIDDEN", "Insufficient permissions", {
        required: roles,
        actual: actualRole
      });
    }
  };
}
