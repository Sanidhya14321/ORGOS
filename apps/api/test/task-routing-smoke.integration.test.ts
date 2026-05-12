import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { io, type Socket } from "socket.io-client";
import tasksRoutes from "../src/routes/tasks.js";
import { createSupabaseMock } from "./helpers/createSupabaseMock.js";
import { initializeNotifier } from "../src/services/notifier.js";

describe("task routing smoke integration", () => {
  const orgId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const requesterId = "11111111-1111-4111-8111-111111111111";
  const assigneeId = "22222222-2222-4222-8222-222222222222";
  const taskId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

  let app = Fastify();
  let requesterClient: Socket | null = null;
  let assigneeClient: Socket | null = null;

  beforeEach(async () => {
    app = Fastify();
    app.decorate("env", { WEB_ORIGIN: "http://localhost:3000" });
    app.decorate("redis", {});
    app.decorate("supabaseService", createSupabaseMock({
      users: [
        {
          id: requesterId,
          full_name: "CFO One",
          role: "cfo",
          org_id: orgId,
          status: "active"
        },
        {
          id: assigneeId,
          full_name: "Manager One",
          role: "manager",
          org_id: orgId,
          status: "active"
        }
      ],
      tasks: [
        {
          id: taskId,
          org_id: orgId,
          created_by: requesterId,
          goal_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          title: "Routing smoke task",
          success_criteria: "Exercise realtime routing",
          assigned_role: "worker",
          assigned_to: null,
          status: "routing",
          routing_confirmed: false,
          is_agent_task: true
        }
      ],
      routing_suggestions: [],
      reports: [],
      agent_logs: []
    }));

    const tokenToUser = new Map([
      ["requester-token", { id: requesterId, role: "cfo", org_id: orgId }],
      ["assignee-token", { id: assigneeId, role: "manager", org_id: orgId }]
    ]);

    app.decorate("supabaseAnon", {
      auth: {
        getUser: vi.fn(async (token: string) => {
          const user = tokenToUser.get(token);
          return {
            data: user
              ? {
                  user: {
                    id: user.id,
                    user_metadata: { role: user.role, org_id: user.org_id }
                  }
                }
              : { user: null },
            error: null
          };
        })
      }
    });

    initializeNotifier(app);
    app.addHook("onRequest", async (request) => {
      const role = String(request.headers["x-test-role"] ?? "cfo");
      const userId = String(request.headers["x-test-user-id"] ?? requesterId);
      request.requestId = "task-routing-smoke-test";
      request.userRole = role;
      request.user = { id: userId, user_metadata: { role } } as never;
    });
    app.register(tasksRoutes, { prefix: "/api" });

    await app.listen({ port: 0, host: "127.0.0.1" });

    const address = app.server.address();
    if (!address || typeof address === "string") {
      throw new Error("Smoke test server did not bind to a port");
    }

    requesterClient = io(`http://127.0.0.1:${address.port}`, {
      transports: ["websocket"],
      auth: { token: "requester-token" }
    });

    assigneeClient = io(`http://127.0.0.1:${address.port}`, {
      transports: ["websocket"],
      auth: { token: "assignee-token" }
    });

    await Promise.all([
      new Promise<void>((resolve, reject) => {
        requesterClient?.once("connect", () => resolve());
        requesterClient?.once("connect_error", (error) => reject(error));
      }),
      new Promise<void>((resolve, reject) => {
        assigneeClient?.once("connect", () => resolve());
        assigneeClient?.once("connect_error", (error) => reject(error));
      })
    ]);
  });

  afterEach(async () => {
    requesterClient?.disconnect();
    assigneeClient?.disconnect();
    requesterClient = null;
    assigneeClient = null;
    await app.close();
  });

  it("delivers routing suggestion and assignment websocket events end to end", async () => {
    const routingReady = new Promise<Record<string, unknown>>((resolve) => {
      requesterClient?.once("task:routing_ready", (payload) => resolve(payload as Record<string, unknown>));
    });

    const suggestResponse = await app.inject({
      method: "POST",
      url: `/api/tasks/${taskId}/routing-suggest`,
      headers: {
        "x-test-role": "cfo",
        "x-test-user-id": requesterId
      },
      payload: {
        suggestions: [
          {
            assigneeId,
            reason: "Best fit",
            confidence: 0.93
          }
        ]
      }
    });

    expect(suggestResponse.statusCode).toBe(200);
    expect(await routingReady).toMatchObject({
      taskId,
      suggestions: [
        {
          assigneeId,
          reason: "Best fit",
          confidence: 0.93
        }
      ]
    });

    const assigned = new Promise<Record<string, unknown>>((resolve) => {
      assigneeClient?.once("task:assigned", (payload) => resolve(payload as Record<string, unknown>));
    });

    const delegateResponse = await app.inject({
      method: "POST",
      url: `/api/tasks/${taskId}/delegate`,
      headers: {
        "x-test-role": "cfo",
        "x-test-user-id": requesterId
      },
      payload: { assignTo: assigneeId }
    });

    expect(delegateResponse.statusCode).toBe(200);
    expect(await assigned).toMatchObject({
      taskId,
      role: "manager"
    });
  });
});