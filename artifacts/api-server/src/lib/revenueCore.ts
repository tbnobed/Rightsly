export type RevenueStatus = "expected" | "received" | "overdue";

/**
 * A report is received as soon as both receipt facts have been recorded.
 * This intentionally takes precedence over a user-selected status.
 */
export function deriveRevenueStatus(
  requestedStatus: RevenueStatus,
  receivedDate: string | null,
  amountReceived: string | number | null,
): RevenueStatus {
  if (receivedDate && amountReceived !== null) return "received";
  return requestedStatus === "received" ? "expected" : requestedStatus;
}

export function formatRevenueAmount(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const amount = Number(value);
  return Number.isFinite(amount)
    ? amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "";
}