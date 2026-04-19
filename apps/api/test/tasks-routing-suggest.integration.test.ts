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

  beforeEach(async () => {
    addMock.mockClear();
    const mod = await import("../src/routes/tasks.js");
    tasksRoutes = mod.default;
  });

  it("returns 202 and enqueues async suggestion when payload omits suggestions", async () => {
    const app = Fastify();

    app.decorate("supabaseService", {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null })
          })
        })
      })
    });
    app.decorate("env", { NODE_ENV: "test" });
    app.decorate("redis", {});

    app.addHook("onRequest", async (request) => {
      request.userRole = "manager";
      request.user = {
        id: "33333333-3333-4333-8333-333333333333",
        user_metadata: { role: "manager" }
      } as never;
      request.requestId = "req-routing-suggest";
    });

    app.register(tasksRoutes, { prefix: "/api" });
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: "/api/tasks/cccccccc-cccc-4ccc-8ccc-cccccccccccc/routing-suggest",
      payload: {}
    });

    expect(response.statusCode).toBe(202);
    expect(addMock).toHaveBeenCalledTimes(1);
    expect(addMock).toHaveBeenCalledWith("routing_suggest", {
      mode: "routing_suggest",
      taskId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
    });

    await app.close();
  });
});
