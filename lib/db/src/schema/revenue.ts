import { pgTable, text, timestamp, date, numeric, pgEnum } from "drizzle-orm/pg-core";
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
  expectedDate: date("expected_date"),
  receivedDate: date("received_date"),
  amount: numeric("amount"),
  status: reportStatusEnum("status").notNull().default("expected"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const royaltyApprovalsTable = pgTable("royalty_approvals", {
  id: text("id").primaryKey(),
  reportId: text("report_id")
    .notNull()
    .references(() => revenueReportsTable.id, { onDelete: "cascade" }),
  status: royaltyReviewStatusEnum("status").notNull().default("pending"),
  reviewedBy: text("reviewed_by").references(() => usersTable.id),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertRevenueReportSchema = createInsertSchema(revenueReportsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertRevenueReport = z.infer<typeof insertRevenueReportSchema>;
export type RevenueReport = typeof revenueReportsTable.$inferSelect;
export type RoyaltyApproval = typeof royaltyApprovalsTable.$inferSelect;
