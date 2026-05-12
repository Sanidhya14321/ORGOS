import test from "node:test";
import assert from "node:assert/strict";
import authRoutes from "../src/routes/auth.js";
import { buildRouteTestApp, createSupabaseMock, type QueryOperation } from "./helpers/mockBackend.js";

const orgId = "00000000-0000-0000-0000-000000000101";
const positionId = "00000000-0000-0000-0000-000000000102";
const credentialId = "00000000-0000-0000-0000-000000000103";
const authUserId = "00000000-0000-0000-0000-000000000104";

test("seat activation creates the user profile and marks the seat active", async () => {
  const supabase = createSupabaseMock({
    resolve: async (operation: QueryOperation) => {
      if (operation.table === "position_credentials" && operation.action === "select") {
        return {
          data: {
            id: credentialId,
            org_id: orgId,
            position_id: positionId,
            email: "vp-engineering@acme.test",
            password_hash: "$2b$12$abcdefghijklmnopqrstuvabcdefghijklmnopqrstuvabcdefghijklmnop",
            invite_token: "invite-token-123456",
            invite_code: "ABCD1234",
            activation_status: "pending"
          }
        };
      }

      if (operation.table === "positions" && operation.action === "select") {
        return {
          data: {
            id: positionId,
            org_id: orgId,
            title: "VP Engineering",
            level: 1,
            department: "Engineering"
          }
        };
      }

      if (operation.table === "users" && operation.action === "upsert") {
        return { data: null };
      }

      if (
        operation.table === "users" &&
        operation.action === "select" &&
        operation.select === "id, email, full_name, role, status, org_id, position_id, reports_to, department, skills, open_task_count, agent_enabled, mfa_enabled"
      ) {
        return {
          data: {
            id: authUserId,
            email: "vp-engineering@acme.test",
            full_name: "Taylor Engineer",
            role: "manager",
            status: "active",
            org_id: orgId,
            position_id: positionId,
            reports_to: null,
            department: "Engineering",
            skills: [],
            open_task_count: 0,
            agent_enabled: true,
            mfa_enabled: false
          }
        };
      }

      if (operation.table === "position_credentials" && operation.action === "update") {
        return { data: null };
      }

      if (operation.table === "position_assignments" && operation.action === "select") {
        return { data: null };
      }

      if (operation.table === "position_assignments" && operation.action === "insert") {
        return { data: { id: "00000000-0000-0000-0000-000000000105" } };
      }

      if (operation.table === "sessions" && operation.action === "upsert") {
        return { data: null };
      }

      return { data: null };
    },
    auth: {
      admin: {
        createUser: async () => ({
          data: {
            user: {
              id: authUserId,
              email: "vp-engineering@acme.test"
            }
          },
          error: null
        })
      },
      signInWithPassword: async () => ({
        data: {
          session: {
            access_token: "seat-access-token",
            refresh_token: "seat-refresh-token"
          },
          user: {
            id: authUserId,
            email: "vp-engineering@acme.test",
            user_metadata: {
              full_name: "Taylor Engineer",
              role: "manager",
              department: "Engineering",
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
    supabaseAnon: supabase.client
  });

  const response = await app.inject({
    method: "POST",
    url: "/auth/activate-seat",
    payload: {
      inviteToken: "invite-token-123456",
      fullName: "Taylor Engineer",
      password: "super-secure-password"
    }
  });

  assert.equal(response.statusCode, 201);
  assert.equal(response.json().user.role, "manager");

  const credentialUpdate = supabase.operations.find(
    (operation) => operation.table === "position_credentials" && operation.action === "update"
  );
  assert.ok(credentialUpdate);
  assert.equal((credentialUpdate.values as { activation_status: string }).activation_status, "activated");

  const assignmentInsert = supabase.operations.find(
    (operation) => operation.table === "position_assignments" && operation.action === "insert"
  );
  assert.ok(assignmentInsert);
  assert.equal((assignmentInsert.values as { assignment_status: string }).assignment_status, "active");

  await app.close();
});
