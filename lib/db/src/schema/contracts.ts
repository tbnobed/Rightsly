import {
  pgTable,
  text,
  timestamp,
  date,
  pgEnum,
  json,
  boolean,
  numeric,
  integer,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { partnersTable } from "./partners";
import { usersTable } from "./users";

export const contractDirectionEnum = pgEnum("contract_direction", ["rights_in", "rights_out"]);
export const contractStatusEnum = pgEnum("contract_status", [
  "draft",
  "active",
  "expired",
  "in_perpetuity",
  "terminated",
]);
export const endTypeEnum = pgEnum("end_type", ["date", "perpetuity", "auto_renew"]);
export const royaltyTypeEnum = pgEnum("royalty_type", ["revenue_share", "flat_fee", "other"]);
export const paymentTermsEnum = pgEnum("payment_terms", ["net_30", "net_60", "net_90"]);

export const contractsTable = pgTable("contracts", {
  id: text("id").primaryKey(),
  direction: contractDirectionEnum("direction").notNull(),
  partnerId: text("partner_id")
    .notNull()
    .references(() => partnersTable.id),
  licensor: text("licensor"),
  licensee: text("licensee"),
  status: contractStatusEnum("status").notNull().default("draft"),
  startDate: date("start_date"),
  endType: endTypeEnum("end_type").notNull(),
  endDate: date("end_date"),
  territories: json("territories").$type<string[]>().notNull().default([]),
  otherTerritories: text("other_territories"),
  distributionTypes: json("distribution_types").$type<string[]>().notNull().default([]),
  platform: text("platform"),
  royaltyType: royaltyTypeEnum("royalty_type"),
  royaltyDetails: text("royalty_details"),
  paymentTerms: paymentTermsEnum("payment_terms"),
  notes: text("notes"),
  documentUrl: text("document_url"),
  websiteLink: text("website_link"),

  // Rights In specific
  rightsInPlatforms: json("rights_in_platforms").$type<string[]>(),
  rightsInYoutubeChannel: text("rights_in_youtube_channel"),
  rightsInSocialPlatforms: json("rights_in_social_platforms").$type<string[]>(),
  rightsInSocialHandle: text("rights_in_social_handle"),
  rightsInGrantOfRights: text("rights_in_grant_of_rights"),
  rightsInExclusivityStartDate: date("rights_in_exclusivity_start_date"),
  rightsInExclusivityEndDate: date("rights_in_exclusivity_end_date"),
  rightsInExclusivitySameAsDuration: boolean("rights_in_exclusivity_same_as_duration").default(false),
  rightsInMarketingRights: text("rights_in_marketing_rights"),

  // Rights Out specific
  rightsOutAutoRenew: boolean("rights_out_auto_renew").default(false),
  rightsOutHasAmendment: boolean("rights_out_has_amendment").default(false),
  rightsOutExclusivity: text("rights_out_exclusivity"),
  rightsOutReportingFrequency: text("rights_out_reporting_frequency"),
  rightsOutMinPaymentThreshold: numeric("rights_out_min_payment_threshold"),

  createdBy: text("created_by").references(() => usersTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const contractContentTable = pgTable("contract_content", {
  contractId: text("contract_id")
    .notNull()
    .references(() => contractsTable.id, { onDelete: "cascade" }),
  contentItemId: text("content_item_id").notNull(),
});

export const amendmentsTable = pgTable("amendments", {
  id: text("id").primaryKey(),
  contractId: text("contract_id")
    .notNull()
    .references(() => contractsTable.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  description: text("description").notNull(),
  documentUrl: text("document_url"),
  createdBy: text("created_by").references(() => usersTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const contractAttachmentsTable = pgTable("contract_attachments", {
  id: text("id").primaryKey(),
  contractId: text("contract_id")
    .notNull()
    .references(() => contractsTable.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  objectPath: text("object_path").notNull(),
  contentType: text("content_type"),
  size: integer("size"),
  uploadedBy: text("uploaded_by").references(() => usersTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertContractSchema = createInsertSchema(contractsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertAmendmentSchema = createInsertSchema(amendmentsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertContract = z.infer<typeof insertContractSchema>;
export type Contract = typeof contractsTable.$inferSelect;
export type Amendment = typeof amendmentsTable.$inferSelect;
export type ContractContent = typeof contractContentTable.$inferSelect;
export type ContractAttachment = typeof contractAttachmentsTable.$inferSelect;
