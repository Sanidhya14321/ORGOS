import { beforeEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import type { FastifyPluginAsync } from "fastify";

const addMock = vi.fn(async () => ({ id: "job-1" }));

vi.mock("../src/queue/index.js", () => ({
  getManagerQueue: () => ({
    add: addMock
  })
}));

describe("task routing suggest route", () => {
  let tasksRoutes: FastifyPluginAsync;
  const requesterId = "33333333-3333-4333-8333-333333333333";
  const taskId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

  function createSupabaseServiceStub(params: { requesterOrgId: string | null; taskOrgId: string | null }) {
    return {
      from: (table: string) => {
        if (table === "users") {
          return {
            select: () => ({
              eq: (_column: string, value: string) => ({
                maybeSingle: async () => ({
                  data: value === requesterId && params.requesterOrgId
                    ? { org_id: params.requesterOrgId }
                    : null,
                  error: null
                })
              })
            })
          };
        }

        if (table === "tasks") {
          return {
            select: () => ({
              eq: (_column: string, value: string) => ({
                maybeSingle: async () => ({
                  data: value === taskId && params.taskOrgId
                    ? { id: taskId, org_id: params.taskOrgId }
                    : null,
                  error: null
                })
              })
            })
          };
        }

        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null })
            })
          })
        };
      }
    };
  }

  beforeEach(async () => {
    addMock.mockClear();
    const mod = await import("../src/routes/tasks.js");
    tasksRoutes = mod.default;
  });

  it("returns 202 and enqueues async suggestion when payload omits suggestions", async () => {
    const app = Fastify();

    app.decorate("supabaseService", createSupabaseServiceStub({
      requesterOrgId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      taskOrgId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    }));
    app.decorate("env", { NODE_ENV: "test" });
    app.decorate("redis", {});

    app.addHook("onRequest", async (request) => {
      request.userRole = "manager";
      request.user = {
        id: requesterId,
        user_metadata: { role: "manager" }
      } as never;
      request.requestId = "req-routing-suggest";
    });

    app.register(tasksRoutes, { prefix: "/api" });
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: `/api/tasks/${taskId}/routing-suggest`,
      payload: {}
    });

    expect(response.statusCode).toBe(202);
    expect(addMock).toHaveBeenCalledTimes(1);
    expect(addMock).toHaveBeenCalledWith("routing_suggest", {
      mode: "routing_suggest",
      taskId
    });

    await app.close();
  });

  it("returns 403 when requester is not linked to an organization", async () => {
    const app = Fastify();

    app.decorate("supabaseService", createSupabaseServiceStub({
      requesterOrgId: null,
      taskOrgId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    }));
    app.decorate("env", { NODE_ENV: "test" });
    app.decorate("redis", {});

    app.addHook("onRequest", async (request) => {
      request.userRole = "manager";
      request.user = {
        id: requesterId,
        user_metadata: { role: "manager" }
      } as never;
      request.requestId = "req-routing-suggest-no-org";
    });

    app.register(tasksRoutes, { prefix: "/api" });
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: `/api/tasks/${taskId}/routing-suggest`,
      payload: {}
    });

    expect(response.statusCode).toBe(403);
    expect(addMock).not.toHaveBeenCalled();

    await app.close();
  });

  it("returns 403 when task belongs to a different organization", async () => {
    const app = Fastify();

    app.decorate("supabaseService", createSupabaseServiceStub({
      requesterOrgId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      taskOrgId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
    }));
    app.decorate("env", { NODE_ENV: "test" });
    app.decorate("redis", {});

    app.addHook("onRequest", async (request) => {
      request.userRole = "manager";
      request.user = {
        id: requesterId,
        user_metadata: { role: "manager" }
      } as never;
      request.requestId = "req-routing-suggest-org-mismatch";
    });

    app.register(tasksRoutes, { prefix: "/api" });
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: `/api/tasks/${taskId}/routing-suggest`,
      payload: {}
    });

    expect(response.statusCode).toBe(403);
    expect(addMock).not.toHaveBeenCalled();

    await app.close();
  });
});
