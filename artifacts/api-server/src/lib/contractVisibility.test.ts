import test from "node:test";
import assert from "node:assert/strict";
import { isSalesVisibleContract } from "./contractVisibilityCore.ts";

test("Sales visibility rejects expired, archived, and inactive contracts", () => {
  const base = { status: "active", archived: false, endType: "date", endDate: "2026-08-26" };
  assert.equal(isSalesVisibleContract(base, "2026-08-26"), true);
  assert.equal(isSalesVisibleContract({ ...base, endDate: "2026-08-25" }, "2026-08-26"), false);
  assert.equal(isSalesVisibleContract({ ...base, archived: true }, "2026-08-26"), false);
  assert.equal(isSalesVisibleContract({ ...base, status: "draft" }, "2026-08-26"), false);
});