import type { FastifyReply, FastifyRequest } from "fastify";

export type ApiErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION_ERROR"
  | "INTERNAL_ERROR"
  | "SERVICE_UNAVAILABLE"
  | "RATE_LIMITED"
  | "MFA_REQUIRED"
  | "SESSION_EXPIRED"
  | "SESSION_LIMITED";

export function sendApiError(
  reply: FastifyReply,
  request: FastifyRequest,
  statusCode: number,
  code: ApiErrorCode,
  message: string,
  extra?: Record<string, unknown>
): FastifyReply {
  return reply.status(statusCode).send({
    error: {
      code,
      message,
      requestId: request.requestId,
      ...extra
    }
  });
}
