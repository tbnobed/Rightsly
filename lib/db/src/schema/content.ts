import { pgTable, text, timestamp, integer, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const contentTypeEnum = pgEnum("content_type", [
  "Film",
  "TVSeries",
  "TBN_FAST",
  "TBN_Linear",
  "WoF_FAST",
]);

export const contentItemsTable = pgTable("content_items", {
  id: text("id").primaryKey(),
  type: contentTypeEnum("type").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  year: integer("year"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const seasonsTable = pgTable("seasons", {
  id: text("id").primaryKey(),
  contentItemId: text("content_item_id")
    .notNull()
    .references(() => contentItemsTable.id, { onDelete: "cascade" }),
  seasonNumber: integer("season_number").notNull(),
  title: text("title"),
  year: integer("year"),
  episodeCount: integer("episode_count"),
});

export const insertContentItemSchema = createInsertSchema(contentItemsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertSeasonSchema = createInsertSchema(seasonsTable).omit({ id: true });

export type InsertContentItem = z.infer<typeof insertContentItemSchema>;
export type ContentItem = typeof contentItemsTable.$inferSelect;
export type Season = typeof seasonsTable.$inferSelect;
