import type { FastifyInstance } from "fastify";
import { Server as SocketIOServer } from "socket.io";
import type { Socket } from "socket.io";

type Role = "ceo" | "cfo" | "manager" | "worker";

let io: SocketIOServer | null = null;
let fastifyRef: FastifyInstance | null = null;

function userRoom(userId: string): string {
  return `user:${userId}`;
}

function roleRoom(role: Role): string {
  return `role:${role}`;
}

function orgRoom(orgId: string): string {
  return `org:${orgId}`;
}

function requireIo(): SocketIOServer | null {
  if (!io) {
    return null;
  }
  return io;
}

async function resolveRealtimeContext(
  fastify: FastifyInstance,
  userId: string,
  metadataRole: unknown,
  metadataOrgId: unknown
): Promise<{ role: Role | null; orgId: string | null }> {
  const role = typeof metadataRole === "string" ? (metadataRole as Role) : null;
  const metadataOrg = typeof metadataOrgId === "string" ? metadataOrgId : null;

  const profile = await fastify.supabaseService
    .from("users")
    .select("role, org_id")
    .eq("id", userId)
    .maybeSingle();

  if (profile.error) {
    return {
      role,
      orgId: metadataOrg
    };
  }

  const profileRole = typeof profile.data?.role === "string" ? (profile.data.role as Role) : role;
  const profileOrg = typeof profile.data?.org_id === "string" ? profile.data.org_id : metadataOrg;

  return {
    role: profileRole,
    orgId: profileOrg
  };
}

export function initializeNotifier(fastify: FastifyInstance): void {
  fastifyRef = fastify;

  io = new SocketIOServer(fastify.server, {
    cors: {
      origin: fastify.env.WEB_ORIGIN,
      credentials: true
    },
    pingInterval: 30_000,
    pingTimeout: 60_000
  });

  io.on("connection", async (socket: Socket) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      socket.disconnect(true);
      return;
    }

    const { data, error } = await fastify.supabaseAnon.auth.getUser(token);
    if (error || !data.user) {
      socket.disconnect(true);
      return;
    }

    const userId = data.user.id;
    const { role, orgId } = await resolveRealtimeContext(
      fastify,
      userId,
      data.user.user_metadata?.role,
      data.user.user_metadata?.org_id
    );

    socket.join(userRoom(userId));
    if (role) {
      socket.join(roleRoom(role));
    }
    if (orgId) {
      socket.join(orgRoom(orgId));
    }

    socket.on("disconnect", () => {
      // no-op, room cleanup is automatic.
    });
  });
}

export function emitToUser(userId: string, event: string, payload: unknown): void {
  const server = requireIo();
  if (!server) {
    return;
  }
  server.to(userRoom(userId)).emit(event, payload);
}

export function emitToRole(role: Role, event: string, payload: unknown): void {
  const server = requireIo();
  if (!server) {
    return;
  }
  server.to(roleRoom(role)).emit(event, payload);
}

export function emitToOrg(orgId: string, event: string, payload: unknown): void {
  const server = requireIo();
  if (!server) {
    return;
  }
  server.to(orgRoom(orgId)).emit(event, payload);
}

export function emitTaskAssigned(assigneeId: string, payload: unknown): void {
  emitToUser(assigneeId, "task:assigned", payload);
}

export function emitTaskStatusChanged(assigneeId: string, managerId: string | null, payload: unknown): void {
  emitToUser(assigneeId, "task:status_changed", payload);
  if (managerId) {
    emitToUser(managerId, "task:status_changed", payload);
  }
}

export async function emitTaskReportSubmittedCascade(taskId: string, payload: unknown): Promise<void> {
  if (!fastifyRef) {
    return;
  }

  const rootTaskLookup = await fastifyRef.supabaseService
    .from("tasks")
    .select("org_id")
    .eq("id", taskId)
    .maybeSingle();

  const orgId = typeof rootTaskLookup.data?.org_id === "string" ? rootTaskLookup.data.org_id : null;
  if (orgId) {
    emitToOrg(orgId, "task:report_submitted", { taskId, ...((payload as Record<string, unknown>) ?? {}) });
  }

  // Walk up tree and notify manager assignees plus exec roles.
  let cursor: string | null = taskId;
  const notified = new Set<string>();

  while (cursor) {
    const result = await fastifyRef.supabaseService
      .from("tasks")
      .select("id, parent_id, assigned_to, assigned_role")
      .eq("id", cursor)
      .maybeSingle();

    const taskRow = result.data as {
      id: string;
      parent_id: string | null;
      assigned_to: string | null;
      assigned_role: string;
    } | null;

    if (!taskRow) {
      break;
    }

    if (taskRow.assigned_to && taskRow.assigned_role === "manager" && !notified.has(taskRow.assigned_to as string)) {
      emitToUser(taskRow.assigned_to as string, "task:report_submitted", payload);
      notified.add(taskRow.assigned_to as string);
    }

    cursor = (taskRow.parent_id as string | null) ?? null;
  }

  emitToRole("ceo", "task:report_submitted", payload);
  emitToRole("cfo", "task:report_submitted", payload);
}

export function emitGoalDecomposed(payload: unknown): void {
  emitToRole("ceo", "goal:decomposed", payload);
  emitToRole("cfo", "goal:decomposed", payload);
}

export function emitAgentExecuting(taskManagerId: string | null, payload: unknown): void {
  if (taskManagerId) {
    emitToUser(taskManagerId, "agent:executing", payload);
  }
}

export function emitAgentEscalated(taskManagerId: string | null, payload: unknown): void {
  if (taskManagerId) {
    emitToUser(taskManagerId, "agent:escalated", payload);
  }
  emitToRole("ceo", "agent:escalated", payload);
}
