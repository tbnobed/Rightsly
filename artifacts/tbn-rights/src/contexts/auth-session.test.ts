import assert from "node:assert/strict";
import test from "node:test";
import { isUnauthorizedAuthError } from "./auth-session.ts";

test("recognizes an expired or rejected authentication token", () => {
  assert.equal(isUnauthorizedAuthError({ status: 401 }), true);
});

test("does not treat network and server failures as an expired session", () => {
  assert.equal(isUnauthorizedAuthError({ status: 500 }), false);
  assert.equal(isUnauthorizedAuthError(new Error("Network unavailable")), false);
  assert.equal(isUnauthorizedAuthError(null), false);
});