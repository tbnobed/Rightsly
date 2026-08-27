import { canViewFinancials } from "./rolePolicy.ts";

export function canReceiveRevenueNotifications(role: string | null | undefined) {
  return canViewFinancials(role);
}

export function canSendNotificationEmails(nodeEnv: string | undefined) {
  return nodeEnv === "production";
}