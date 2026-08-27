import test from "node:test";
import assert from "node:assert/strict";
import { canViewFinancials, isAdminLike, isStrictAdmin, roleLabel } from "../lib/permissions.ts";

test("content admin receives admin-like application permissions", () => {
  assert.equal(isAdminLike("admin"), true);
  assert.equal(isAdminLike("content_admin"), true);
  assert.equal(canViewFinancials("content_admin"), true);
});

test("users and audit log remain strict-admin permissions", () => {
  assert.equal(isStrictAdmin("admin"), true);
  assert.equal(isStrictAdmin("content_admin"), false);
  assert.equal(isStrictAdmin("legal"), false);
});

test("content admin has a human-readable label", () => {
  assert.equal(roleLabel("content_admin"), "Content Admin");
  assert.equal(roleLabel("finance"), "Finance");
});