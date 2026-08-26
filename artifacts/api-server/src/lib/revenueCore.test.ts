import assert from "node:assert/strict";
import test from "node:test";
import { deriveRevenueStatus, formatRevenueAmount } from "./revenueCore.ts";

test("formats revenue amounts with exactly two decimal places", () => {
  assert.equal(formatRevenueAmount(12), "12.00");
  assert.equal(formatRevenueAmount("1234.5"), "1,234.50");
  assert.equal(formatRevenueAmount(null), "");
});

test("derives received status only when both receipt facts are present", () => {
  assert.equal(deriveRevenueStatus("expected", "2026-04-01", "0"), "received");
  assert.equal(deriveRevenueStatus("overdue", "2026-04-01", "35.25"), "received");
  assert.equal(deriveRevenueStatus("expected", null, "35.25"), "expected");
  assert.equal(deriveRevenueStatus("received", "2026-04-01", null), "expected");
  assert.equal(deriveRevenueStatus("received", null, "35.25"), "expected");
});