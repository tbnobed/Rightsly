import { and, eq, notInArray } from "drizzle-orm";
import { revenueReportsTable } from "@workspace/db";
import { buildRevenueSchedule, type ScheduleContract } from "./revenueScheduleCore";
export { buildRevenueSchedule } from "./revenueScheduleCore";

export async function syncRevenueSchedule(executor: any, contract: ScheduleContract) {
  const rows = buildRevenueSchedule(contract);
  const keys = rows.map((row) => row.scheduleKey);
  const generatedExpected = and(
    eq(revenueReportsTable.contractId, contract.id),
    eq(revenueReportsTable.scheduleGenerated, true),
    eq(revenueReportsTable.status, "expected"),
  );
  await executor.delete(revenueReportsTable).where(
    keys.length ? and(generatedExpected, notInArray(revenueReportsTable.scheduleKey, keys)) : generatedExpected,
  );
  if (rows.length) {
    for (const row of rows) {
      await executor.insert(revenueReportsTable).values(row).onConflictDoNothing();
      await executor.update(revenueReportsTable).set({
          period: row.period,
          periodStart: row.periodStart,
          periodEnd: row.periodEnd,
          expectedDate: row.expectedDate,
        }).where(and(
          eq(revenueReportsTable.scheduleKey, row.scheduleKey),
          eq(revenueReportsTable.status, "expected"),
        ));
    }
  }
}