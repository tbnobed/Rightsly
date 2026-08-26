import assert from "node:assert/strict";
import test from "node:test";
import { validateContractDates } from "./contractDates.ts";

test("accepts an end date after the start date", () => {
  assert.equal(
    validateContractDates({ startDate: "2026-01-01", endType: "date", endDate: "2026-12-31" }),
    null,
  );
});

test("accepts an end date equal to the start date", () => {
  assert.equal(
    validateContractDates({ startDate: "2026-01-01", endType: "date", endDate: "2026-01-01" }),
    null,
  );
});

test("rejects an end date before the start date", () => {
  assert.equal(
    validateContractDates({ startDate: "2026-01-01", endType: "date", endDate: "2025-12-31" }),
    "endDate must be on or after startDate",
  );
});

test("requires an end date for a date-bounded contract", () => {
  assert.equal(
    validateContractDates({ startDate: "2026-01-01", endType: "date", endDate: null }),
    "endDate is required when endType is date",
  );
});

test("does not require an end date for perpetuity", () => {
  assert.equal(
    validateContractDates({ startDate: "2026-01-01", endType: "perpetuity", endDate: null }),
    null,
  );
});

test("rejects impossible calendar dates", () => {
  assert.equal(
    validateContractDates({ startDate: "2026-02-30", endType: "perpetuity", endDate: null }),
    "startDate must be a valid YYYY-MM-DD value",
  );
});