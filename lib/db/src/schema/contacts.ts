import { index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const contactsTable = pgTable("contacts", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  company: text("company"),
  title: text("title"),
  email: text("email"),
  phone: text("phone"),
  notes: text("notes"),
  importSourceKey: text("import_source_key"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("contacts_name_idx").on(table.name),
  index("contacts_company_idx").on(table.company),
  uniqueIndex("contacts_import_source_key_idx").on(table.importSourceKey),
]);

export const insertContactSchema = createInsertSchema(contactsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  importSourceKey: true,
});
export type InsertContact = z.infer<typeof insertContactSchema>;
export type Contact = typeof contactsTable.$inferSelect;