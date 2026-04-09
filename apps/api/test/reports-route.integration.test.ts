import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import reportsRoutes from "../src/routes/reports.js";
import { createSupabaseMock } from "./helpers/createSupabaseMock.js";

const { enqueueMock, emitMock } = vi.hoisted(() => ({
  enqueueMock: vi.fn(),
  emitMock: vi.fn()
}));

vi.mock("../src/queue/index.js", () => ({
  synthesizeQueue: { add: enqueueMock }
}));

vi.mock("../src/services/notifier.js", () => ({
  emitTaskReportSubmittedCascade: emitMock
}));

describe("reports route integration", () => {
  const supabase = createSupabaseMock({
    users: [
      { id: "11111111-1111-4111-8111-111111111111", department: "operations" },
      { id: "22222222-2222-4222-8222-222222222222", department: "operations" }
    ],
    goals: [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", title: "Launch" }],
    tasks: [
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        parent_id: null,
        assigned_to: "11111111-1111-4111-8111-111111111111",
        status: "in_progress"
      },
      {
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        parent_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        assigned_to: "11111111-1111-4111-8111-111111111111",
        status: "completed"
      }
    ],
    reports: [],
    agent_logs: []
  });

  beforeEach(() => {
    enqueueMock.mockReset();
    emitMock.mockReset();
  });

  function buildApp() {
    const app = Fastify();
    app.decorate("supabaseService", supabase);
    app.decorate("supabaseAnon", { auth: { getUser: vi.fn() } });
    app.decorate("env", {});
    app.decorate("redis", {});

    app.addHook("onRequest", async (request) => {
      request.user = { id: "11111111-1111-4111-8111-111111111111" } as never;
      request.userRole = "worker";
    });

    app.register(reportsRoutes, { prefix: "/api" });
    return app;
  }

  it("submits a report, updates task status, and enqueues synthesis when sibling work is done", async () => {
    const app = buildApp();
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: "/api/reports",
      payload: {
        task_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        is_agent: false,
        status: "completed",
        insight: "done with validation-safe detail",
        data: { note: "ok" },
        confidence: 0.91,
        sources: [
          {
            url: "https://example.com/report-source",
            title: "Report Source",
            accessed: "2026-04-09T10:00:00.000Z"
          }
        ],
        escalate: false
      }
    });

    expect(response.statusCode).toBe(201);
    expect(enqueueMock).toHaveBeenCalledWith("report_synthesize", {
      parentTaskId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
    });
    expect(emitMock).toHaveBeenCalledWith(
      "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      expect.objectContaining({ reportId: expect.any(String) })
    );

    const storedReport = supabase.store.reports.at(-1);
    expect(storedReport?.task_id).toBe("cccccccc-cccc-4ccc-8ccc-cccccccccccc");
    expect(
      supabase.store.tasks.find((task) => task.id === "cccccccc-cccc-4ccc-8ccc-cccccccccccc")?.report_id
    ).toBeDefined();

    await app.close();
  });
});