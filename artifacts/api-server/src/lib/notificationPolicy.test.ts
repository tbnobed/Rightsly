import test from "node:test";
import assert from "node:assert/strict";
import { canReceiveRevenueNotifications } from "./notificationPolicy.ts";

test("revenue notifications are restricted to financial roles", () => {
  assert.equal(canReceiveRevenueNotifications("admin"), true);
  assert.equal(canReceiveRevenueNotifications("finance"), true);
  assert.equal(canReceiveRevenueNotifications("legal"), false);
  assert.equal(canReceiveRevenueNotifications("sales"), false);
});