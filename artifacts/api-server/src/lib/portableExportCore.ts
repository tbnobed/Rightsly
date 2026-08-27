import { csvCell } from "./csv.ts";

/** Stable portable-export filenames, one for each current application table. */
export const PORTABLE_EXPORT_FILE_NAMES = [
  "amendments.csv", "audit_logs.csv", "contacts.csv", "content_items.csv",
  "contract_attachments.csv", "contract_content.csv", "contract_seasons.csv",
  "contracts.csv", "episodes.csv", "notifications.csv", "partners.csv",
  "revenue_reports.csv", "royalty_approvals.csv", "seasons.csv", "users.csv",
] as const;

export const PORTABLE_SECRET_FIELDS = ["passwordHash", "inviteTokenHash"] as const;
export const STRICT_ADMIN_EXPORT_FILES = ["audit_logs.csv", "users.csv"] as const;
const SENSITIVE_KEY = /(password|token|secret|credential|api[_-]?key|hash)/i;

export function portableExportFileNamesForRole(role: string): readonly string[] {
  return role === "admin"
    ? PORTABLE_EXPORT_FILE_NAMES
    : PORTABLE_EXPORT_FILE_NAMES.filter(
        (filename) => !STRICT_ADMIN_EXPORT_FILES.includes(
          filename as (typeof STRICT_ADMIN_EXPORT_FILES)[number],
        ),
      );
}

function portableValue(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && value !== null) return JSON.stringify(value);
  return value === null || value === undefined ? "" : String(value);
}

/** Deterministic, formula-safe CSV with a final newline. */
export function serializePortableCsv(headers: string[], rows: Record<string, unknown>[]): string {
  return [
    headers.map(csvCell).join(","),
    ...rows.map((row) => headers.map((header) => csvCell(portableValue(row[header]))).join(",")),
    "",
  ].join("\n");
}

function removeSensitiveValues(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(removeSensitiveValues);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !SENSITIVE_KEY.test(key))
      .map(([key, child]) => [key, removeSensitiveValues(child)]));
  }
  return value;
}

/** Audit summaries may contain prior request payloads, so redact sensitive keys there too. */
export function sanitizePortableRecord(row: Record<string, unknown>): Record<string, unknown> {
  const clean = { ...row };
  for (const key of ["beforeSummary", "afterSummary"]) {
    const value = clean[key];
    if (typeof value !== "string") continue;
    try {
      clean[key] = JSON.stringify(removeSensitiveValues(JSON.parse(value)));
    } catch {
      // Legacy non-JSON summaries are retained; route code never writes secrets outside JSON.
    }
  }
  return clean;
}