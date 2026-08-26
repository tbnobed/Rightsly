import assert from "node:assert/strict";
import test from "node:test";
import { getContractsPagination, getNextContractSort } from "./contracts-list-state.ts";

test("pagination reports accurate ranges and clamps out-of-range pages", () => {
  assert.deepEqual(getContractsPagination(45, 2, 20), {
    totalPages: 3,
    safePage: 2,
    start: 21,
    end: 40,
  });
  assert.deepEqual(getContractsPagination(45, 99, 20), {
    totalPages: 3,
    safePage: 3,
    start: 41,
    end: 45,
  });
  assert.deepEqual(getContractsPagination(0, 1, 20), {
    totalPages: 1,
    safePage: 1,
    start: 0,
    end: 0,
  });
});

test("sorting toggles the active column and starts new columns ascending", () => {
  assert.deepEqual(getNextContractSort("partnerName", "asc", "partnerName"), {
    sortBy: "partnerName",
    sortDirection: "desc",
  });
  assert.deepEqual(getNextContractSort("partnerName", "desc", "endDate"), {
    sortBy: "endDate",
    sortDirection: "asc",
  });
});