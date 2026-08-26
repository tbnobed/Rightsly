import { pgTable, text, timestamp, date, numeric, boolean, pgEnum, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { contractsTable } from "./contracts";
import { usersTable } from "./users";

export const reportStatusEnum = pgEnum("report_status", ["expected", "received", "overdue"]);
export const royaltyReviewStatusEnum = pgEnum("royalty_review_status", [
  "pending",
  "reviewed",
  "approved",
]);

export const revenueReportsTable = pgTable("revenue_reports", {
  id: text("id").primaryKey(),
  contractId: text("contract_id")
    .notNull()
    .references(() => contractsTable.id, { onDelete: "cascade" }),
  period: text("period").notNull(),
  periodStart: date("period_start"),
  periodEnd: date("period_end"),
  expectedDate: date("expected_date"),
  scheduleGenerated: boolean("schedule_generated").notNull().default(false),
  scheduleKey: text("schedule_key"),
  receivedDate: date("received_date"),
  // These are deliberately independent: a partner's reported receipts are not
  // a calculated royalty, and costs must not be inferred from a contract split.
  amountReceived: numeric("amount_received"),
  costAmount: numeric("cost_amount"),
  // Retained only while the legacy reporting export and seed are reconciled.
  // New report routes never read or write this calculated-era field.
  amount: numeric("amount"),
  status: reportStatusEnum("status").notNull().default("expected"),
  documentPath: text("document_path"),
  documentName: text("document_name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("revenue_reports_schedule_key_idx").on(table.scheduleKey),
]);

export const royaltyApprovalsTable = pgTable("royalty_approvals", {
  id: text("id").primaryKey(),
  reportId: text("report_id")
    .notNull()
    .references(() => revenueReportsTable.id, { onDelete: "cascade" }),
  status: royaltyReviewStatusEnum("status").notNull().default("pending"),
  reviewedBy: text("reviewed_by").references(() => usersTable.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  // A report has one current review decision, rather than an ambiguous history.
  uniqueIndex("royalty_approvals_report_id_idx").on(table.reportId),
]);

export const insertRevenueReportSchema = createInsertSchema(revenueReportsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertRevenueReport = z.infer<typeof insertRevenueReportSchema>;
export type RevenueReport = typeof revenueReportsTable.$inferSelect;
export type RoyaltyApproval = typeof royaltyApprovalsTable.$inferSelect;
