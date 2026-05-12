import test from "node:test";
import assert from "node:assert/strict";
import { canAccessSection, canManageGoals, canManageRecruitment, isExecutiveRole } from "../../web/lib/access.ts";

test("frontend access rules enforce least-privilege section visibility", () => {
  assert.equal(isExecutiveRole("ceo"), true);
  assert.equal(isExecutiveRole("worker"), false);

  assert.equal(canManageGoals("ceo"), true);
  assert.equal(canManageGoals("manager"), false);

  assert.equal(canManageRecruitment("manager"), true);
  assert.equal(canManageRecruitment("worker"), false);

  assert.equal(canAccessSection("worker", "goals"), true);
  assert.equal(canAccessSection("worker", "taskBoard"), true);
  assert.equal(canAccessSection("worker", "team"), true);
  assert.equal(canAccessSection("worker", "orgSettings"), false);
  assert.equal(canAccessSection("worker", "analytics"), false);
  assert.equal(canAccessSection("manager", "forecast"), true);
  assert.equal(canAccessSection("manager", "recruitment"), true);
  assert.equal(canAccessSection("manager", "approvals"), false);
});
