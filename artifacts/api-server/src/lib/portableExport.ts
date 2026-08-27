import { getTableColumns } from "drizzle-orm";
import {
  amendmentsTable, auditLogsTable, contactsTable, contentItemsTable, contractAttachmentsTable,
  contractContentTable, contractsTable, contractSeasonsTable, episodesTable, notificationsTable,
  partnersTable, revenueReportsTable, royaltyApprovalsTable, seasonsTable, usersTable,
} from "@workspace/db";
import { portableExportFileNamesForRole, PORTABLE_SECRET_FIELDS } from "./portableExportCore.ts";

export {
  portableExportFileNamesForRole, PORTABLE_EXPORT_FILE_NAMES, PORTABLE_SECRET_FIELDS,
  sanitizePortableRecord, serializePortableCsv,
} from "./portableExportCore.ts";

type ExportTable = {
  filename: string;
  table: Parameters<typeof getTableColumns>[0];
  orderBy: string[];
  excluded?: string[];
  strictAdminOnly?: boolean;
};

/** Every current application table. Headers use stable schema property names. */
export const PORTABLE_EXPORT_TABLES: ExportTable[] = [
  { filename: "amendments.csv", table: amendmentsTable, orderBy: ["id"] },
  { filename: "audit_logs.csv", table: auditLogsTable, orderBy: ["id"], strictAdminOnly: true },
  { filename: "contacts.csv", table: contactsTable, orderBy: ["id"] },
  { filename: "content_items.csv", table: contentItemsTable, orderBy: ["id"] },
  { filename: "contract_attachments.csv", table: contractAttachmentsTable, orderBy: ["id"] },
  { filename: "contract_content.csv", table: contractContentTable, orderBy: ["contractId", "contentItemId"] },
  { filename: "contract_seasons.csv", table: contractSeasonsTable, orderBy: ["contractId", "seasonId"] },
  { filename: "contracts.csv", table: contractsTable, orderBy: ["id"] },
  { filename: "episodes.csv", table: episodesTable, orderBy: ["id"] },
  { filename: "notifications.csv", table: notificationsTable, orderBy: ["id"] },
  { filename: "partners.csv", table: partnersTable, orderBy: ["id"] },
  { filename: "revenue_reports.csv", table: revenueReportsTable, orderBy: ["id"] },
  { filename: "royalty_approvals.csv", table: royaltyApprovalsTable, orderBy: ["id"] },
  { filename: "seasons.csv", table: seasonsTable, orderBy: ["id"] },
  // Authentication material is deliberately never portable.
  {
    filename: "users.csv",
    table: usersTable,
    orderBy: ["id"],
    excluded: [...PORTABLE_SECRET_FIELDS],
    strictAdminOnly: true,
  },
];

export function exportHeaders(spec: ExportTable): string[] {
  return Object.keys(getTableColumns(spec.table)).filter((name) => !spec.excluded?.includes(name));
}

export function portableExportTablesForRole(role: string): ExportTable[] {
  const allowedFiles = new Set(portableExportFileNamesForRole(role));
  return PORTABLE_EXPORT_TABLES.filter((spec) => allowedFiles.has(spec.filename));
}

export const PORTABLE_EXPORT_README = `Rightsly portable data export

This archive contains UTF-8, comma-separated CSV files for the Rightsly datasets your role may access.
CSV headers are stable schema property names and records are sorted by primary/key columns.
Values beginning with spreadsheet formula characters are prefixed with an apostrophe.

For security, users.passwordHash and users.inviteTokenHash are excluded, and sensitive values
within audit summaries are redacted. Attachment and document records retain metadata and object
paths only; this portable export contains no file binaries.
Content Admin exports exclude users.csv and audit_logs.csv because those areas are Admin-only.
Use the self-hosted operational backup for PostgreSQL and object-binary disaster recovery.
`;