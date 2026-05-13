import test from "node:test";
import assert from "node:assert/strict";
import { canAccessSection, canManageGoals } from "./access.js";

test("workers keep read access to scoped execution sections only", () => {
  assert.equal(canAccessSection("worker", "taskBoard"), true);
  assert.equal(canAccessSection("worker", "goals"), true);
  assert.equal(canAccessSection("worker", "orgTree"), true);
  assert.equal(canAccessSection("worker", "team"), true);
  assert.equal(canAccessSection("worker", "recruitment"), false);
  assert.equal(canAccessSection("worker", "orgSettings"), false);
  assert.equal(canManageGoals("worker"), false);
});

test("executives retain org-wide management sections", () => {
  assert.equal(canAccessSection("ceo", "recruitment"), true);
  assert.equal(canAccessSection("cfo", "orgSettings"), true);
  assert.equal(canAccessSection("ceo", "forecast"), true);
  assert.equal(canAccessSection("ceo", "knowledge"), true);
  assert.equal(canAccessSection("cfo", "knowledge"), false);
  assert.equal(canManageGoals("ceo"), true);
  assert.equal(canManageGoals("cfo"), true);
});
