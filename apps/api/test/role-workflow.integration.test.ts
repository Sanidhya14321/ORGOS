import Fastify from "fastify";
import { beforeEach, describe, expect, it } from "vitest";
import orgRoutes from "../src/routes/org.js";
import tasksRoutes from "../src/routes/tasks.js";
import { createSupabaseMock } from "./helpers/createSupabaseMock.js";

describe("role workflow integration", () => {
  const supabase = createSupabaseMock({
    orgs: [
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        name: "Acme",
        domain: "acme.com"
      }
    ],
    users: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        email: "ceo@acme.com",
        role: "ceo",
        org_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        status: "active"
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        email: "cfo@acme.com",
        role: "cfo",
        org_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        status: "active"
      },
      {
        id: "33333333-3333-4333-8333-333333333333",
        email: "manager@acme.com",
        role: "manager",
        org_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        department: "engineering",
        status: "active"
      },
      {
        id: "44444444-4444-4444-8444-444444444444",
        email: "worker@acme.com",
        role: "worker",
        org_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        department: "engineering",
        reports_to: "33333333-3333-4333-8333-333333333333",
        status: "active"
      },
      {
        id: "55555555-5555-4555-8555-555555555555",
        email: "pending@acme.com",
        role: "worker",
        org_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        status: "pending"
      }
    ],
    goals: [
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        title: "Launch",
        status: "active",
        priority: "high"
      }
    ],
    tasks: [
      {
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        org_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        goal_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        assigned_to: "33333333-3333-4333-8333-333333333333",
        assigned_role: "manager",
        status: "routing",
        title: "Manager routing task",
        success_criteria: "route it",
        depth: 1,
        is_agent_task: false
      },
      {
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        org_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        goal_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        assigned_to: "44444444-4444-4444-8444-444444444444",
        assigned_role: "worker",
        status: "pending",
        title: "Worker task",
        success_criteria: "complete",
        depth: 2,
        is_agent_task: false
      }
    ],
    reports: [],
    agent_logs: [],
    positions: [],
    routing_suggestions: [],
    audit_log: []
  });

  function buildApp() {
    const app = Fastify();
    app.decorate("supabaseService", supabase);
    app.decorate("supabaseAnon", { auth: { getUser: async () => ({ data: { user: null }, error: null }) } });
    app.decorate("env", {});
    app.decorate("redis", { incr: async () => 0, expire: async () => 1 });

    app.addHook("onRequest", async (request) => {
      const role = String(request.headers["x-test-role"] ?? "ceo");
      const id = String(request.headers["x-test-user-id"] ?? "11111111-1111-4111-8111-111111111111");
      request.requestId = "test-request-id";
      request.userRole = role;
      request.user = { id, user_metadata: { role } } as never;
    });

    app.register(orgRoutes, { prefix: "/api" });
    app.register(tasksRoutes, { prefix: "/api" });

    return app;
  }

  beforeEach(() => {
    // no-op: this suite intentionally works against a mutable in-memory fixture.
  });

  it("validates role workflows across CEO/CFO/Manager/Worker", async () => {
    const app = buildApp();
    await app.ready();

    const ceoCreate = await app.inject({
      method: "POST",
      url: "/api/tasks",
      headers: {
        "x-test-role": "ceo",
        "x-test-user-id": "11111111-1111-4111-8111-111111111111"
      },
      payload: {
        orgId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        goalId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        title: "CEO root task",
        successCriteria: "Deliver",
        assignedRole: "manager",
        depth: 0
      }
    });
    expect(ceoCreate.statusCode).toBe(201);

    const cfoApprove = await app.inject({
      method: "POST",
      url: "/api/orgs/members/55555555-5555-4555-8555-555555555555/approve",
      headers: {
        "x-test-role": "cfo",
        "x-test-user-id": "22222222-2222-4222-8222-222222222222"
      },
      payload: {}
    });
    expect(cfoApprove.statusCode).toBe(200);

    const managerConfirmRoutingDenied = await app.inject({
      method: "POST",
      url: "/api/tasks/cccccccc-cccc-4ccc-8ccc-cccccccccccc/routing-confirm",
      headers: {
        "x-test-role": "manager",
        "x-test-user-id": "33333333-3333-4333-8333-333333333333"
      },
      payload: {
        confirmed: [
          {
            assigneeId: "44444444-4444-4444-8444-444444444444",
            reason: "best fit",
            confidence: 0.9
          }
        ],
        status: "active"
      }
    });
    expect(managerConfirmRoutingDenied.statusCode).toBe(403);

    const managerDelegateDown = await app.inject({
      method: "POST",
      url: "/api/tasks/cccccccc-cccc-4ccc-8ccc-cccccccccccc/delegate",
      headers: {
        "x-test-role": "manager",
        "x-test-user-id": "33333333-3333-4333-8333-333333333333"
      },
      payload: {
        assignTo: "44444444-4444-4444-8444-444444444444",
        role: "worker"
      }
    });
    expect(managerDelegateDown.statusCode).toBe(200);

    const workerPatch = await app.inject({
      method: "PATCH",
      url: "/api/tasks/dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      headers: {
        "x-test-role": "worker",
        "x-test-user-id": "44444444-4444-4444-8444-444444444444"
      },
      payload: {
        status: "in_progress"
      }
    });
    expect(workerPatch.statusCode).toBe(200);

    const workerDelegateDenied = await app.inject({
      method: "POST",
      url: "/api/tasks/dddddddd-dddd-4ddd-8ddd-dddddddddddd/delegate",
      headers: {
        "x-test-role": "worker",
        "x-test-user-id": "44444444-4444-4444-8444-444444444444"
      },
      payload: {
        assignTo: "33333333-3333-4333-8333-333333333333",
        role: "manager"
      }
    });
    expect(workerDelegateDenied.statusCode).toBe(403);

    await app.close();
  });
});
