import test from "node:test";
import assert from "node:assert/strict";
import { buildRevenueSchedule } from "./revenueScheduleCore.ts";

test("builds monthly periods and applies net terms", () => {
  const rows = buildRevenueSchedule({
    id: "c1", direction: "rights_out", startDate: "2026-01-01",
    endType: "date", endDate: "2026-03-31",
    reportingFrequency: "monthly", paymentTerms: "net_30",
  });
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((row) => [row.periodStart, row.periodEnd, row.expectedDate]), [
    ["2026-01-01", "2026-01-31", "2026-03-02"],
    ["2026-02-01", "2026-02-28", "2026-03-30"],
    ["2026-03-01", "2026-03-31", "2026-04-30"],
  ]);
});

test("does not schedule Rights In contracts", () => {
  assert.deepEqual(buildRevenueSchedule({
    id: "c2", direction: "rights_in", startDate: "2026-01-01",
    endType: "date", endDate: "2026-12-31",
    reportingFrequency: "quarterly", paymentTerms: "net_60",
  }), []);
});