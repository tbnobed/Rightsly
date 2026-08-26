export function canReceiveRevenueNotifications(role: string | null | undefined) {
  return role === "admin" || role === "finance";
}