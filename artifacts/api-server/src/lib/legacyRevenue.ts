import { and, isNotNull, isNull, sql } from "drizzle-orm";
import { db, revenueReportsTable } from "@workspace/db";
export { effectiveAmountReceived } from "./legacyRevenueCore";

export async function backfillLegacyRevenueAmounts() {
  await db
    .update(revenueReportsTable)
    .set({ amountReceived: sql`${revenueReportsTable.amount}` })
    .where(and(
      isNull(revenueReportsTable.amountReceived),
      isNotNull(revenueReportsTable.amount),
    ));
}