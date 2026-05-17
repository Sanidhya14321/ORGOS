import test from "node:test";
import assert from "node:assert/strict";
import authRoutes from "../src/routes/auth.js";
import { buildRouteTestApp, createSupabaseMock, type QueryOperation } from "./helpers/mockBackend.js";

const userId = "00000000-0000-0000-0000-00000000c0de";
const accessToken = "google-oauth-access-token";

function createOAuthSupabaseMock(options: {
  getUser: (token: string) => Promise<{ data: { user: { id: string; email: string; user_metadata: Record<string, unknown> } | null }; error: { message: string } | null }>;
}) {
  return createSupabaseMock({
    resolve: (operation: QueryOperation) => {
      if (
        operation.table === "users" &&
        operation.action === "select" &&
        operation.select === "id, email, full_name, role, status, org_id, position_id, reports_to, department, skills, open_task_count, agent_enabled, mfa_enabled"
      ) {
        return {
          data: {
            id: userId,
            email: "user@orgos.test",
            full_name: "OAuth User",
            role: "ceo",
            status: "active",
            org_id: "00000000-0000-0000-0000-000000009001",
            position_id: null,
            reports_to: null,
            department: "Executive",
            skills: [],
            open_task_count: 0,
            agent_enabled: true,
            mfa_enabled: false
          }
        };
      }

      if (operation.table === "sessions" && operation.action === "select") {
        return { data: [] };
      }

      if (operation.table === "sessions" && operation.action === "upsert") {
        return { data: null };
      }

      return { data: null };
    },
    auth: {
      getUser: options.getUser,
      signOut: async () => ({ error: null })
    }
  });
}

test("oauth callback sets session cookie for valid access token", async () => {
  const supabase = createOAuthSupabaseMock({
    getUser: async (token) => {
      if (token !== accessToken) {
        return { data: { user: null }, error: { message: "invalid token" } };
      }

      return {
        data: {
          user: {
            id: userId,
            email: "user@orgos.test",
            user_metadata: { full_name: "OAuth User", role: "ceo" }
          }
        },
        error: null
      };
    }
  });

  const app = await buildRouteTestApp({
    routes: authRoutes,
    supabaseService: supabase.client,
    supabaseAnon: supabase.client,
    env: {
      RELAX_SECURITY_FOR_LOCAL_TESTING: true
    }
  });

  const response = await app.inject({
    method: "POST",
    url: "/auth/oauth/callback",
    payload: { accessToken }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().user.role, "ceo");
  assert.match(String(response.headers["set-cookie"]), /orgos_access_token=/);

  await app.close();
});

test("oauth callback rejects invalid access token", async () => {
  const supabase = createOAuthSupabaseMock({
    getUser: async () => ({ data: { user: null }, error: { message: "invalid token" } })
  });

  const app = await buildRouteTestApp({
    routes: authRoutes,
    supabaseService: supabase.client,
    supabaseAnon: supabase.client
  });

  const response = await app.inject({
    method: "POST",
    url: "/auth/oauth/callback",
    payload: { accessToken: "bad-token" }
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.json().error.code, "UNAUTHORIZED");

  await app.close();
});
