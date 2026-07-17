import { pgTable, text, timestamp, boolean, pgEnum, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const notificationTypeEnum = pgEnum("notification_type", [
  "contract_expiring",
  "report_expected",
  "approval_needed",
  "general",
]);

export const notificationsTable = pgTable("notifications", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  type: notificationTypeEnum("type").notNull().default("general"),
  title: text("title").notNull(),
  message: text("message"),
  // Deep link target within the app, e.g. /contracts/<id>
  link: text("link"),
  // Dedupe key so background generation doesn't re-create the same alert
  dedupeKey: text("dedupe_key"),
  read: boolean("read").notNull().default(false),
  // Soft-delete: cleared notifications stay in the table so dedupeKey
  // prevents regeneration, but they are excluded from listings
  dismissed: boolean("dismissed").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("notifications_user_dedupe_idx").on(table.userId, table.dedupeKey),
]);

export type Notification = typeof notificationsTable.$inferSelect;
