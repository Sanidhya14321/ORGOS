import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import tasksRoutes from "../src/routes/tasks.js";
import { createSupabaseMock } from "./helpers/createSupabaseMock.js";

const { emitToUserMock, emitTaskAssignedMock, persistRoutingOutcomeMock } = vi.hoisted(() => ({
  emitToUserMock: vi.fn(),
  emitTaskAssignedMock: vi.fn(),
  persistRoutingOutcomeMock: vi.fn()
}));

vi.mock("../src/services/notifier.js", () => ({
  emitToUser: emitToUserMock,
  emitTaskAssigned: emitTaskAssignedMock,
  emitTaskStatusChanged: vi.fn()
}));

vi.mock("../src/services/routingMemory.js", () => ({
  persistRoutingOutcome: persistRoutingOutcomeMock
}));

describe("task routing flow integration", () => {
  const orgId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const requesterId = "11111111-1111-4111-8111-111111111111";
  const assigneeId = "22222222-2222-4222-8222-222222222222";
  const taskId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

  function buildApp() {
    const supabase = createSupabaseMock({
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
          title: "Routing test task",
          success_criteria: "Confirm routing and delegation",
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
    });

    const app = Fastify();
    app.decorate("supabaseService", supabase);
    app.decorate("env", { NODE_ENV: "test" });
    app.decorate("redis", {});

    app.addHook("onRequest", async (request) => {
      const role = String(request.headers["x-test-role"] ?? "cfo");
      const userId = String(request.headers["x-test-user-id"] ?? requesterId);
      request.requestId = "task-routing-flow-test";
      request.userRole = role;
      request.user = { id: userId, user_metadata: { role } } as never;
    });

    app.register(tasksRoutes, { prefix: "/api" });
    return { app, supabase };
  }

  beforeEach(() => {
    emitToUserMock.mockReset();
    emitTaskAssignedMock.mockReset();
    persistRoutingOutcomeMock.mockReset();
  });

  it("stores routing suggestions, confirms routing, and delegates the task", async () => {
    const { app, supabase } = buildApp();
    await app.ready();

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
            reason: "Best fit for the task",
            confidence: 0.91
          }
        ]
      }
    });

    expect(suggestResponse.statusCode).toBe(200);
    expect(JSON.parse(suggestResponse.payload)).toEqual({
      suggestions: [
        {
          assigneeId,
          reason: "Best fit for the task",
          confidence: 0.91
        }
      ]
    });
    expect(supabase.store.routing_suggestions).toHaveLength(1);
    expect(emitToUserMock).toHaveBeenCalledWith(requesterId, "task:routing_ready", {
      taskId,
      suggestions: [
        {
          assigneeId,
          reason: "Best fit for the task",
          confidence: 0.91
        }
      ]
    });

    const confirmResponse = await app.inject({
      method: "POST",
      url: `/api/tasks/${taskId}/routing-confirm`,
      headers: {
        "x-test-role": "cfo",
        "x-test-user-id": requesterId
      },
      payload: {
        confirmed: [
          {
            assigneeId,
            reason: "Approved",
            confidence: 0.91
          }
        ],
        status: "active"
      }
    });

    expect(confirmResponse.statusCode).toBe(200);
    expect(supabase.store.tasks.find((task) => task.id === taskId)?.routing_confirmed).toBe(true);
    expect(persistRoutingOutcomeMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        taskId,
        confirmed: [
          {
            assigneeId,
            reason: "Approved",
            confidence: 0.91
          }
        ],
        outcome: "confirmed"
      })
    );
    expect(emitToUserMock).toHaveBeenCalledWith(assigneeId, "task:routing_confirmed", {
      taskId,
      confidence: 0.91
    });

    const delegateResponse = await app.inject({
      method: "POST",
      url: `/api/tasks/${taskId}/delegate`,
      headers: {
        "x-test-role": "cfo",
        "x-test-user-id": requesterId
      },
      payload: {
        assignTo: assigneeId
      }
    });

    expect(delegateResponse.statusCode).toBe(200);
    expect(supabase.store.tasks.find((task) => task.id === taskId)?.assigned_to).toBe(assigneeId);
    expect(supabase.store.tasks.find((task) => task.id === taskId)?.assigned_role).toBe("manager");
    expect(emitTaskAssignedMock).toHaveBeenCalledWith(assigneeId, {
      taskId,
      role: "manager",
      isAgentTask: false
    });

    await app.close();
  });
});