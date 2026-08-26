import test from "node:test";
import assert from "node:assert/strict";
import { canReceiveRevenueNotifications, canSendNotificationEmails } from "./notificationPolicy.ts";

test("revenue notifications are restricted to financial roles", () => {
  assert.equal(canReceiveRevenueNotifications("admin"), true);
  assert.equal(canReceiveRevenueNotifications("finance"), true);
  assert.equal(canReceiveRevenueNotifications("legal"), false);
  assert.equal(canReceiveRevenueNotifications("sales"), false);
});

test("notification emails are sent only in production", () => {
  assert.equal(canSendNotificationEmails("production"), true);
  assert.equal(canSendNotificationEmails("development"), false);
  assert.equal(canSendNotificationEmails("test"), false);
  assert.equal(canSendNotificationEmails(undefined), false);
});