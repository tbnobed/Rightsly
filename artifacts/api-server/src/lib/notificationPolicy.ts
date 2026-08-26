export function canReceiveRevenueNotifications(role: string | null | undefined) {
  return role === "admin" || role === "finance";
}

export function canSendNotificationEmails(nodeEnv: string | undefined) {
  return nodeEnv === "production";
}