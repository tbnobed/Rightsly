import { and, eq, sql } from "drizzle-orm";
import { contractsTable } from "@workspace/db";
export { isSalesVisibleContract } from "./contractVisibilityCore";

export function salesVisibleContractPredicate(today = new Date().toISOString().slice(0, 10)) {
  return and(
    eq(contractsTable.status, "active"),
    eq(contractsTable.archived, false),
    sql`(${contractsTable.endType} <> 'date' OR ${contractsTable.endDate} >= ${today})`,
  );
}
