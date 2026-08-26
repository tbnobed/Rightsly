import { pgTable, text, timestamp, integer, pgEnum, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const contentTypeEnum = pgEnum("content_type", [
  "Film",
  "TVSeries",
  "TBN_FAST",
  "TBN_Linear",
  "WoF_FAST",
]);

export const contentSourceEnum = pgEnum("content_source", ["tbn", "third_party"]);
export const titleRightsTermEnum = pgEnum("title_rights_term", ["months", "years", "in_perpetuity"]);

export const contentItemsTable = pgTable("content_items", {
  id: text("id").primaryKey(),
  type: contentTypeEnum("type").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  contentSource: contentSourceEnum("content_source"),
  tbnMediaId: text("tbn_media_id"),
  notes: text("notes"),
  year: integer("year"),
  broadcastRightsDuration: integer("broadcast_rights_duration"),
  broadcastRightsTerm: titleRightsTermEnum("broadcast_rights_term"),
  broadcastRightsCustomTerm: text("broadcast_rights_custom_term"),
  digitalRightsDuration: integer("digital_rights_duration"),
  digitalRightsTerm: titleRightsTermEnum("digital_rights_term"),
  digitalRightsCustomTerm: text("digital_rights_custom_term"),
  internationalRightsDuration: integer("international_rights_duration"),
  internationalRightsTerm: titleRightsTermEnum("international_rights_term"),
  internationalRightsCustomTerm: text("international_rights_custom_term"),
  internationalBroadcastAirAmount: integer("international_broadcast_air_amount"),
  youtubeRightsDuration: integer("youtube_rights_duration"),
  youtubeRightsTerm: titleRightsTermEnum("youtube_rights_term"),
  youtubeRightsCustomTerm: text("youtube_rights_custom_term"),
  hasCleans: boolean("has_cleans").notNull().default(false),
  hasCaptions: boolean("has_captions").notNull().default(false),
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
