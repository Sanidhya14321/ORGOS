import type { FastifyInstance } from "fastify";

type AuditCategory = "general" | "security" | "auth" | "integration" | "analytics" | "billing";
type AuditSeverity = "debug" | "info" | "warn" | "error" | "critical";

export type AuditEventInput = {
  orgId?: string | null;
  actorId?: string | null;
  category?: AuditCategory;
  severity?: AuditSeverity;
  action: string;
  entity: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  path?: string | null;
  userAgent?: string | null;
  ipAddress?: string | null;
};

export async function writeAuditEvent(fastify: FastifyInstance, input: AuditEventInput): Promise<void> {
  const payload = {
    org_id: input.orgId ?? null,
    actor_id: input.actorId ?? null,
    category: input.category ?? "general",
    severity: input.severity ?? "info",
    action: input.action,
    entity: input.entity,
    entity_id: input.entityId ?? null,
    metadata: input.metadata ?? {},
    path: input.path ?? null,
    user_agent: input.userAgent ?? null,
    ip_address: input.ipAddress ?? null
  };

  const { error } = await fastify.supabaseService.from("audit_log").insert(payload);
  if (error) {
    fastify.log.warn({ err: error, payload }, "Failed to persist audit event");
  }
}