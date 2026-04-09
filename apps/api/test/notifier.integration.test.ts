import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { io, type Socket } from "socket.io-client";
import { createSupabaseMock } from "./helpers/createSupabaseMock.js";
import { emitTaskAssigned, initializeNotifier } from "../src/services/notifier.js";

describe("notifier integration", () => {
  const supabaseMock = createSupabaseMock({
    users: [{ id: "user-1", role: "manager", full_name: "Manager One" }],
    goals: [],
    tasks: [],
    reports: [],
    agent_logs: []
  });

  let app = Fastify();
  let client: Socket | null = null;

  beforeEach(async () => {
    app = Fastify();
    app.decorate("env", { WEB_ORIGIN: "http://localhost:3000" });
    app.decorate("supabaseAnon", {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: "user-1",
              user_metadata: { role: "manager" }
            }
          },
          error: null
        })
      }
    });
    app.decorate("supabaseService", supabaseMock);
    app.decorate("redis", {});
    initializeNotifier(app);
    await app.listen({ port: 0, host: "127.0.0.1" });
  });

  afterEach(async () => {
    if (client) {
      client.disconnect();
      client = null;
    }
    await app.close();
  });

  it("delivers task assignment events to the authenticated socket", async () => {
    const address = app.server.address();
    if (!address || typeof address === "string") {
      throw new Error("Test server did not bind to a port");
    }

    client = io(`http://127.0.0.1:${address.port}`, {
      transports: ["websocket"],
      auth: { token: "access-token" }
    });

    await new Promise<void>((resolve, reject) => {
      client?.once("connect", () => resolve());
      client?.once("connect_error", (error) => reject(error));
    });

    const payloadPromise = new Promise<Record<string, unknown>>((resolve) => {
      client?.once("task:assigned", (payload) => resolve(payload as Record<string, unknown>));
    });

    emitTaskAssigned("user-1", { taskId: "task-123", role: "manager", isAgentTask: false });
    const payload = await payloadPromise;

    expect(payload).toMatchObject({ taskId: "task-123", role: "manager" });
  });
});