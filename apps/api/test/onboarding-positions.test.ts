import test from "node:test";
import assert from "node:assert/strict";
import onboardingRoutes from "../src/routes/onboarding.js";
import { buildRouteTestApp, createSupabaseMock, type QueryOperation } from "./helpers/mockBackend.js";

const ownerId = "00000000-0000-0000-0000-000000000001";
const orgId = "00000000-0000-0000-0000-000000000002";
const positionId = "00000000-0000-0000-0000-000000000003";

function createOnboardingResolver() {
  return async (operation: QueryOperation) => {
    if (operation.table === "orgs" && operation.action === "select") {
      return {
        data: {
          id: orgId,
          domain: "acme.test",
          name: "Acme"
        }
      };
    }

    if (operation.table === "positions" && (operation.action === "insert" || operation.action === "upsert")) {
      return { data: { id: positionId } };
    }

    if (operation.table === "position_assignments" && operation.action === "select") {
      return { data: null };
    }

    if (operation.table === "position_assignments" && operation.action === "insert") {
      return { data: { id: "00000000-0000-0000-0000-000000000010" } };
    }

    if (operation.table === "position_credentials" && operation.action === "upsert") {
      return { data: { id: "00000000-0000-0000-0000-000000000004" } };
    }

    return { data: null };
  };
}

test("onboarding position import writes the foundation position schema", async () => {
  const supabase = createSupabaseMock({
    resolve: createOnboardingResolver()
  });

  const app = await buildRouteTestApp({
    routes: onboardingRoutes,
    supabaseService: supabase.client,
    currentUser: {
      id: ownerId,
      role: "ceo",
      email: "owner@orgos.test"
    }
  });

  const response = await app.inject({
    method: "POST",
    url: "/onboarding/positions/import",
    payload: {
      org_id: orgId,
        import_source: "manual",
        branches: [],
      positions: [
        {
          title: "VP Engineering",
          department: "Engineering",
          level: 1,
          email_prefix: "vp-eng",
            issue_mode: "hybrid"
        }
      ]
    }
  });

  assert.equal(response.statusCode, 200);

  const positionInsert = supabase.operations.find(
    (operation) => operation.table === "positions" && operation.action === "upsert"
  );
  assert.ok(positionInsert);
  assert.deepEqual(positionInsert.values, {
    org_id: orgId,
    branch_id: null,
    title: "VP Engineering",
    department: "Engineering",
    level: 1,
    power_level: 80,
    visibility_scope: "subtree",
    max_concurrent_tasks: 10,
    compensation_band: {},
    is_custom: true,
    confirmed: true,
    updated_at: (positionInsert.values as { updated_at: string }).updated_at
  });

  const assignmentInsert = supabase.operations.find(
    (operation) => operation.table === "position_assignments" && operation.action === "insert"
  );
  assert.ok(assignmentInsert);

  const credentialUpsert = supabase.operations.find(
    (operation) => operation.table === "position_credentials" && operation.action === "upsert"
  );
  assert.ok(credentialUpsert);

  await app.close();
});

test("onboarding position parse preview returns normalized positions from uploaded file payload", async () => {
  const supabase = createSupabaseMock({
    resolve: createOnboardingResolver()
  });

  const app = await buildRouteTestApp({
    routes: onboardingRoutes,
    supabaseService: supabase.client,
    currentUser: {
      id: ownerId,
      role: "ceo",
      email: "owner@orgos.test"
    }
  });

  const csv = [
    "title,department,level,reports_to_title,email_prefix",
    "VP Engineering,Engineering,1,,vp-eng",
    "Engineering Manager,Engineering,3,VP Engineering,eng-manager"
  ].join("\n");

  const response = await app.inject({
    method: "POST",
    url: "/onboarding/positions/parse-preview",
    payload: {
      org_id: orgId,
      file_name: "positions.csv",
      mime_type: "text/csv",
      file_content_base64: Buffer.from(csv, "utf8").toString("base64")
    }
  });

  assert.equal(response.statusCode, 200);

  const payload = response.json();
  assert.equal(payload.import_source, "file");
  assert.equal(payload.source_format, "csv");
  assert.equal(payload.stats.position_count, 2);
  assert.deepEqual(payload.positions.map((position: { title: string }) => position.title), [
    "VP Engineering",
    "Engineering Manager"
  ]);

  await app.close();
});
