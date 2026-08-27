import assert from "node:assert/strict";
import test from "node:test";

import { matchesContractStatusFilter } from "./report-filters.ts";

test("in-perpetuity filter matches the contract end type regardless of workflow status", () => {
  for (const status of ["active", "draft", "terminated"]) {
    assert.equal(
      matchesContractStatusFilter({ status, endType: "perpetuity" }, "in_perpetuity"),
      true,
    );
  }

  assert.equal(
    matchesContractStatusFilter(
      { status: "in_perpetuity", endType: "date" },
      "in_perpetuity",
    ),
    false,
  );
});

test("status and auto-renew filters continue to use their authoritative fields", () => {
  assert.equal(
    matchesContractStatusFilter({ status: "active", endType: "date" }, "active"),
    true,
  );
  assert.equal(
    matchesContractStatusFilter({ status: "active", endType: "auto_renew" }, "auto_renew"),
    true,
  );
});