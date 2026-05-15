import test from "node:test";
import assert from "node:assert/strict";
import type { FastifyPluginAsync } from "fastify";
import { buildMfaCookie } from "../src/lib/session-security.js";
import authPlugin from "../src/plugins/auth.js";
import authRoutes from "../src/routes/auth.js";
import { requireRole } from "../src/plugins/rbac.js";
import { buildRouteTestApp, createSupabaseMock, type QueryOperation } from "./helpers/mockBackend.js";

function createAuthResolver(role: string | null, mfaEnabled: boolean, orgId: string | null = "00000000-0000-0000-0000-000000009001") {
  return (operation: QueryOperation) => {
    if (operation.table === "users" && operation.action === "select") {
      return {
        data: role ? { role, mfa_enabled: mfaEnabled, org_id: orgId } : { role: null, mfa_enabled: mfaEnabled, org_id: null }
      };
    }

    if (operation.table === "sessions" && operation.action === "select") {
      if (operation.mode === "maybeSingle") {
        const now = new Date().toISOString();
        return {
          data: {
            id: "00000000-0000-0000-0000-00000000ab01",
            revoked: false,
            last_active: now,
            created_at: now
          }
        };
      }
      return { data: null };
    }

    if (operation.table === "sessions" && operation.action === "update") {
      return { data: null };
    }

    return { data: null };
  };
}

async function buildSecureApp(options: {
  profileRole: string | null;
  mfaEnabled: boolean;
  metadataRole?: string;
}) {
  const supabase = createSupabaseMock({
    resolve: createAuthResolver(options.profileRole, options.mfaEnabled),
    auth: {
      getUser: async () => ({
        data: {
          user: {
            id: "00000000-0000-0000-0000-000000000123",
            email: "ceo@orgos.test",
            user_metadata: options.metadataRole ? { role: options.metadataRole } : {}
          }
        },
        error: null
      })
    }
  });

  const protectedRoutes: FastifyPluginAsync = async (app) => {
    app.get("/api/secure", { preHandler: requireRole("ceo") }, async (request) => ({
      ok: true,
      role: request.userRole
    }));
  };

  const app = await buildRouteTestApp({
    routes: [authPlugin, protectedRoutes],
    supabaseService: supabase.client,
    supabaseAnon: supabase.client
  });

  return { app, operations: supabase.operations };
}

test("public CEO signup route stays reachable without an access token", async () => {
  const supabase = createSupabaseMock({
    resolve: () => ({ data: null })
  });

  const publicRoutes: FastifyPluginAsync = async (app) => {
    app.post("/api/auth/signup-ceo", async () => ({ ok: true }));
  };

  const app = await buildRouteTestApp({
    routes: [authPlugin, publicRoutes],
    supabaseService: supabase.client,
    supabaseAnon: supabase.client
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/auth/signup-ceo",
    payload: {
      email: "ceo@orgos.test"
    }
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { ok: true });

  await app.close();
});

test("public seat activation route stays reachable without an access token", async () => {
  const supabase = createSupabaseMock({
    resolve: () => ({ data: null })
  });

  const publicRoutes: FastifyPluginAsync = async (app) => {
    app.post("/api/auth/activate-seat", async () => ({ ok: true }));
  };

  const app = await buildRouteTestApp({
    routes: [authPlugin, publicRoutes],
    supabaseService: supabase.client,
    supabaseAnon: supabase.client
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/auth/activate-seat",
    payload: {
      inviteToken: "invite-token-123456"
    }
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { ok: true });

  await app.close();
});

test("protected routes reject metadata-only executive roles", async () => {
  const { app } = await buildSecureApp({
    profileRole: null,
    mfaEnabled: false,
    metadataRole: "ceo"
  });

  const response = await app.inject({
    method: "GET",
    url: "/api/secure",
    headers: {
      authorization: "Bearer metadata-only-token"
    }
  });

  assert.equal(response.statusCode, 403);
  assert.equal(response.json().error.code, "FORBIDDEN");

  await app.close();
});

test("executive routes require MFA when enabled", async () => {
  const { app } = await buildSecureApp({
    profileRole: "ceo",
    mfaEnabled: true,
    metadataRole: "worker"
  });

  const response = await app.inject({
    method: "GET",
    url: "/api/secure",
    headers: {
      authorization: "Bearer exec-token"
    }
  });

  assert.equal(response.statusCode, 403);
  assert.equal(response.json().error.code, "MFA_REQUIRED");

  await app.close();
});

test("DB role remains authoritative when MFA is satisfied", async () => {
  const { app } = await buildSecureApp({
    profileRole: "ceo",
    mfaEnabled: true,
    metadataRole: "worker"
  });

  const accessToken = "exec-token";
  const mfaCookie = buildMfaCookie(accessToken, "service-role-key", false).split(";")[0];

  const response = await app.inject({
    method: "GET",
    url: "/api/secure",
    headers: {
      authorization: `Bearer ${accessToken}`,
      cookie: mfaCookie
    }
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { ok: true, role: "ceo" });

  await app.close();
});

test("local testing flag bypasses login session limits", async () => {
  const userId = "00000000-0000-0000-0000-000000000456";
  const now = new Date().toISOString();
  const supabase = createSupabaseMock({
    resolve: (operation: QueryOperation) => {
      if (
        operation.table === "users" &&
        operation.action === "select" &&
        operation.select === "id, email, full_name, role, status, org_id, position_id, reports_to, department, skills, open_task_count, agent_enabled, mfa_enabled"
      ) {
        return {
          data: {
            id: userId,
            email: "ceo@orgos.test",
            full_name: "Local CEO",
            role: "ceo",
            status: "active",
            org_id: null,
            position_id: null,
            reports_to: null,
            department: "Executive",
            skills: [],
            open_task_count: 0,
            agent_enabled: true,
            mfa_enabled: true
          }
        };
      }

      if (operation.table === "sessions" && operation.action === "select") {
        return {
          data: Array.from({ length: 5 }, (_, index) => ({
            id: `session-${index + 1}`,
            last_active: now,
            revoked: false
          }))
        };
      }

      if (operation.table === "sessions" && operation.action === "upsert") {
        return { data: null };
      }

      return { data: null };
    },
    auth: {
      signInWithPassword: async () => ({
        data: {
          session: {
            access_token: "local-access-token",
            refresh_token: "local-refresh-token"
          },
          user: {
            id: userId,
            email: "ceo@orgos.test",
            user_metadata: {
              full_name: "Local CEO",
              role: "ceo",
              department: "Executive",
              agent_enabled: true
            }
          }
        },
        error: null
      })
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
    url: "/auth/login",
    payload: {
      email: "ceo@orgos.test",
      password: "super-secret-password"
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().mfaRequired, false);
  assert.equal(response.json().mfaSetupRequired, false);

  await app.close();
});
