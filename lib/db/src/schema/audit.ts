import { pgTable, text, timestamp, pgEnum } from "drizzle-orm/pg-core";

export const auditActionEnum = pgEnum("audit_action", [
  "create",
  "update",
  "delete",
  "status_change",
  "login",
  "logout",
]);

export const auditLogsTable = pgTable("audit_logs", {
  id: text("id").primaryKey(),
  userId: text("user_id"),
  userEmail: text("user_email"),
  userName: text("user_name"),
  action: auditActionEnum("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  beforeSummary: text("before_summary"),
  afterSummary: text("after_summary"),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

export type AuditLog = typeof auditLogsTable.$inferSelect;
