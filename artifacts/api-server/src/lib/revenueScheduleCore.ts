import crypto from "node:crypto";

type Frequency = "monthly" | "quarterly" | "annually";
type Terms = "net_30" | "net_60" | "net_90" | null | undefined;
export type ScheduleContract = {
  id: string;
  direction: string;
  startDate: string | null;
  endType: string;
  endDate: string | null;
  reportingFrequency: string | null;
  paymentTerms: Terms;
};

const iso = (date: Date) => date.toISOString().slice(0, 10);
const utc = (value: string) => new Date(`${value}T00:00:00.000Z`);
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 86_400_000);

export function buildRevenueSchedule(contract: ScheduleContract, now = new Date()) {
  if (contract.direction !== "rights_out" || !contract.startDate) return [];
  const frequency = contract.reportingFrequency as Frequency | null;
  if (!["monthly", "quarterly", "annually"].includes(frequency ?? "")) return [];
  const netDays = contract.paymentTerms === "net_60" ? 60 : contract.paymentTerms === "net_90" ? 90 : 30;
  const hardEnd = contract.endType === "date" && contract.endDate
    ? utc(contract.endDate)
    : new Date(Date.UTC(now.getUTCFullYear() + 1, 11, 31));
  let cursor = utc(contract.startDate);
  const rows = [];
  while (cursor <= hardEnd && rows.length < 240) {
    const next = new Date(cursor);
    if (frequency === "monthly") next.setUTCMonth(next.getUTCMonth() + 1);
    else if (frequency === "quarterly") next.setUTCMonth(next.getUTCMonth() + 3);
    else next.setUTCFullYear(next.getUTCFullYear() + 1);
    const periodEnd = new Date(Math.min(addDays(next, -1).getTime(), hardEnd.getTime()));
    const label = frequency === "monthly"
      ? `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`
      : frequency === "quarterly"
        ? `${cursor.getUTCFullYear()}-Q${Math.floor(cursor.getUTCMonth() / 3) + 1}`
        : `${cursor.getUTCFullYear()}`;
    const periodStart = iso(cursor);
    const periodEndText = iso(periodEnd);
    rows.push({
      id: crypto.randomUUID(),
      contractId: contract.id,
      period: label,
      periodStart,
      periodEnd: periodEndText,
      expectedDate: iso(addDays(periodEnd, netDays)),
      status: "expected" as const,
      scheduleGenerated: true,
      scheduleKey: `${contract.id}:${frequency}:${periodStart}:${periodEndText}`,
    });
    cursor = next;
  }
  return rows;
}