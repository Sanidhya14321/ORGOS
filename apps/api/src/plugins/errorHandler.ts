import type { FastifyInstance, FastifyError } from "fastify";
import { sendApiError, type ApiErrorCode } from "../lib/errors.js";
import { captureException } from "../lib/sentry.js";

function mapStatusToCode(status: number): ApiErrorCode {
  if (status === 404) {
    return "NOT_FOUND";
  }
  if (status === 403) {
    return "FORBIDDEN";
  }
  if (status === 400 || status === 422) {
    return "VALIDATION_ERROR";
  }
  if (status === 429) {
    return "RATE_LIMITED";
  }
  if (status === 503) {
    return "SERVICE_UNAVAILABLE";
  }
  return "INTERNAL_ERROR";
}

export function registerApiErrorHandler(fastify: FastifyInstance): void {
  fastify.setErrorHandler(async (error: FastifyError & { statusCode?: number }, request, reply) => {
    request.log.error({ err: error }, "Unhandled API error");
    captureException(error, {
      requestId: request.requestId,
      path: request.url,
      method: request.method,
      userId: request.user?.id,
      orgId: request.userOrgId ?? undefined
    });

    const status =
      typeof error.statusCode === "number" && error.statusCode >= 400 && error.statusCode < 600
        ? error.statusCode
        : 500;
    const code = mapStatusToCode(status);
    const clientMessage =
      status >= 500 ? "Internal server error" : error.message && error.message.length > 0 ? error.message : "Request failed";

    return sendApiError(reply, request, status, code, clientMessage);
  });
}
