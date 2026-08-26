import test from "node:test";
import assert from "node:assert/strict";
import { effectiveAmountReceived } from "./legacyRevenueCore.ts";

test("falls back to a legacy amount without overriding a migrated amount", () => {
  assert.equal(effectiveAmountReceived(null, "125.50"), 125.5);
  assert.equal(effectiveAmountReceived("200", "125.50"), 200);
  assert.equal(effectiveAmountReceived(null, null), null);
});