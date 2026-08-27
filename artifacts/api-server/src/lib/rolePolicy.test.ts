import test from "node:test";
import assert from "node:assert/strict";
import { canViewFinancials, isStrictAdmin, isValidUserRole, roleHasPermission } from "./rolePolicy.ts";

test("content admin inherits admin permissions", () => {
  assert.equal(roleHasPermission("content_admin", ["admin"]), true);
  assert.equal(roleHasPermission("content_admin", ["admin", "legal"]), true);
  assert.equal(roleHasPermission("content_admin", ["finance"]), false);
});

test("strict admin resources exclude content admin", () => {
  assert.equal(isStrictAdmin("admin"), true);
  assert.equal(isStrictAdmin("content_admin"), false);
});

test("existing role permission behavior is preserved", () => {
  assert.equal(roleHasPermission("admin", ["admin"]), true);
  assert.equal(roleHasPermission("legal", ["admin", "legal"]), true);
  assert.equal(roleHasPermission("finance", ["admin", "finance"]), true);
  assert.equal(roleHasPermission("sales", ["admin"]), false);
});

test("user role validation accepts only supported roles", () => {
  for (const role of ["admin", "content_admin", "legal", "finance", "sales"]) {
    assert.equal(isValidUserRole(role), true);
  }
  assert.equal(isValidUserRole("content-admin"), false);
  assert.equal(isValidUserRole("owner"), false);
  assert.equal(isValidUserRole(undefined), false);
});

test("content admin has the same financial access as admin", () => {
  assert.equal(canViewFinancials("content_admin"), true);
  assert.equal(canViewFinancials("admin"), true);
  assert.equal(canViewFinancials("finance"), true);
  assert.equal(canViewFinancials("legal"), false);
});