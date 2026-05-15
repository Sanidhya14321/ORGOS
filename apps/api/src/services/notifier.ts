import type { FastifyInstance } from "fastify";
import { Server as SocketIOServer } from "socket.io";
import type { Socket } from "socket.io";

type Role = "ceo" | "cfo" | "manager" | "worker";

let io: SocketIOServer | null = null;
let fastifyRef: FastifyInstance | null = null;
const ACCESS_TOKEN_COOKIE = "orgos_access_token";

function extractCookieValue(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) {
    return null;
  }

  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const [rawKey, ...rest] = part.trim().split("=");
    if (rawKey === name) {
      const value = rest.join("=");
      return value ? decodeURIComponent(value) : null;
    }
  }

  return null;
}

function userRoom(userId: string): string {
  return `user:${userId}`;
}

function roleRoom(role: Role, orgId: string): string {
  return `org:${orgId}:role:${role}`;
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
  const profile = await fastify.supabaseService
    .from("users")
    .select("role, org_id")
    .eq("id", userId)
    .maybeSingle();

  if (profile.error) {
    return {
      role: null,
      orgId: null
    };
  }

  const profileRole = typeof profile.data?.role === "string" && (
    profile.data.role === "ceo" ||
    profile.data.role === "cfo" ||
    profile.data.role === "manager" ||
    profile.data.role === "worker"
  )
    ? (profile.data.role as Role)
    : null;
  const profileOrg = typeof profile.data?.org_id === "string" ? profile.data.org_id : null;

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
    const handshakeToken = socket.handshake.auth?.token as string | undefined;
    const cookieToken = extractCookieValue(socket.handshake.headers.cookie, ACCESS_TOKEN_COOKIE);
    const token = handshakeToken ?? cookieToken ?? undefined;
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
    if (orgId) {
      socket.join(orgRoom(orgId));
      if (role) {
        socket.join(roleRoom(role, orgId));
      }
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

export function emitToRole(role: Role, event: string, payload: unknown, orgId: string | null): void {
  const server = requireIo();
  if (!server || !orgId) {
    return;
  }
  server.to(roleRoom(role, orgId)).emit(event, payload);
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

  emitToRole("ceo", "task:report_submitted", payload, orgId);
  emitToRole("cfo", "task:report_submitted", payload, orgId);
}

export function emitGoalDecomposed(orgId: string | null, payload: unknown): void {
  emitToRole("ceo", "goal:decomposed", payload, orgId);
  emitToRole("cfo", "goal:decomposed", payload, orgId);
}

/** Realtime decomposition progress for org subscribers */
export function emitGoalProgress(orgId: string | null, payload: unknown): void {
  if (!orgId) {
    return;
  }
  emitToOrg(orgId, "goal:progress", payload);
}

export function emitAgentExecuting(taskManagerId: string | null, payload: unknown): void {
  if (taskManagerId) {
    emitToUser(taskManagerId, "agent:executing", payload);
  }
}

export function emitAgentEscalated(taskManagerId: string | null, orgId: string | null, payload: unknown): void {
  if (taskManagerId) {
    emitToUser(taskManagerId, "agent:escalated", payload);
  }
  emitToRole("ceo", "agent:escalated", payload, orgId);
}
