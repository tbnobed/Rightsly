import { parse } from "csv-parse/sync";
import { validateContractDates } from "./contractDates.ts";
import {
  canonicalDistributionTypes,
  canonicalTerritories,
  unrecognizedDistributionTypes,
  unrecognizedTerritories,
} from "./rightsVocabulary.ts";
import { validateHttpUrl } from "./validation.ts";
import {
  CONTRACT_DIRECTIONS, CONTRACT_STATUSES, END_TYPES, PAYMENT_TERMS, REPORTING_FREQUENCIES,
  ROYALTY_TYPES, isEnumValue,
} from "./rightsValidation.ts";

export const IMPORT_HEADERS = [
  "direction", "partner_name", "licensor", "licensee", "status", "start_date",
  "end_type", "end_date", "territories", "distribution_types", "platform",
  "royalty_type", "royalty_details", "payment_terms", "notes", "website_link",
  "source_key", "import_action", "review_notes", "source_sheet", "source_row",
  "document_url", "partner_website", "partner_contacts", "content_titles",
  "content_seasons", "reporting_frequency", "raw_source_data",
] as const;
export const REQUIRED_IMPORT_HEADERS = ["direction", "partner_name", "end_type"] as const;

export type ContractImportRecord = Record<string, string>;
export type ContractImportAction = "import" | "review" | "skip";
export type ContractImportIssue = { row: number; message: string };
export type ContractImportPreview = {
  total: number;
  ready: number;
  review: number;
  skipped: number;
  invalid: number;
  errors: ContractImportIssue[];
  warnings: ContractImportIssue[];
};
const FINANCIAL_IMPORT_HEADERS = ["royalty_type", "royalty_details", "payment_terms"] as const;

export function hasFinancialImportValues(records: ContractImportRecord[]) {
  return records.some((record) =>
    FINANCIAL_IMPORT_HEADERS.some((header) => record[header]?.trim().length > 0),
  );
}

export function parseContractImportCsv(source: string): ContractImportRecord[] {
  const [header] = parse(source, {
    to_line: 1,
    trim: true,
    skip_empty_lines: true,
  }) as string[][];
  const unknown = (header ?? []).filter((name) => !IMPORT_HEADERS.includes(name as typeof IMPORT_HEADERS[number]));
  const missing = REQUIRED_IMPORT_HEADERS.filter((name) => !(header ?? []).includes(name));
  if (unknown.length) throw new Error(`Unrecognized columns: ${unknown.join(", ")}`);
  if (missing.length) throw new Error(`Missing required columns: ${missing.join(", ")}`);

  const records = (parse(source, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as ContractImportRecord[]).filter((row) =>
    Object.values(row).some((value) => value.trim().length > 0),
  );
  for (let index = 0; index < records.length; index++) {
    for (const [name, value] of Object.entries(records[index])) {
      const trimmed = value.trimStart();
      if (/^[=+@]/.test(trimmed) || (/^-/.test(trimmed) && !/^-?\d+(?:\.\d+)?$/.test(trimmed))) {
        throw new Error(`Potential spreadsheet formula in row ${index + 2}, column ${name}`);
      }
    }
  }
  return records;
}

export function importAction(row: ContractImportRecord): ContractImportAction {
  const value = row.import_action?.trim().toLowerCase() || "import";
  if (!["import", "review", "skip"].includes(value)) {
    throw new Error('import_action must be "import", "review", or "skip"');
  }
  return value as ContractImportAction;
}

function splitPipe(value: string | undefined) {
  return value
    ? [...new Set(value.split("|").map((item) => item.trim()).filter(Boolean))]
    : [];
}

function uniqueByNormalized<T>(values: T[], key: (value: T) => string) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const normalized = key(value);
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

export function previewContractImportRecords(records: ContractImportRecord[]): ContractImportPreview {
  const preview: ContractImportPreview = {
    total: records.length,
    ready: 0,
    review: 0,
    skipped: 0,
    invalid: 0,
    errors: [],
    warnings: [],
  };
  const sourceKeys = new Set<string>();
  records.forEach((record, index) => {
    const row = index + 2;
    try {
      const action = importAction(record);
      if (action === "skip") {
        preview.skipped++;
        if (record.review_notes) preview.warnings.push({ row, message: record.review_notes });
        return;
      }
      if (action === "review") {
        preview.review++;
        preview.warnings.push({
          row,
          message: record.review_notes || "This row requires review before it can be imported",
        });
        return;
      }
      normalizeContractImportRecord(record);
      if (record.source_key) {
        if (sourceKeys.has(record.source_key)) {
          throw new Error(`Duplicate source_key in file: ${record.source_key}`);
        }
        sourceKeys.add(record.source_key);
      }
      preview.ready++;
      if (record.review_notes) preview.warnings.push({ row, message: record.review_notes });
    } catch (error) {
      preview.invalid++;
      preview.errors.push({
        row,
        message: error instanceof Error ? error.message : "Unknown validation error",
      });
    }
  });
  return preview;
}

export function normalizeContractImportRecord(row: ContractImportRecord) {
  if (!isEnumValue(row.direction, CONTRACT_DIRECTIONS)) {
    throw new Error('direction must be "rights_in" or "rights_out"');
  }
  if (!row.partner_name) throw new Error("partner_name is required");
  if (!isEnumValue(row.end_type, END_TYPES)) {
    throw new Error('end_type must be "date", "perpetuity", or "auto_renew"');
  }
  if (row.status && !isEnumValue(row.status, CONTRACT_STATUSES)) {
    throw new Error("status is invalid");
  }
  if (row.royalty_type && !isEnumValue(row.royalty_type, ROYALTY_TYPES)) {
    throw new Error("royalty_type is invalid");
  }
  if (row.payment_terms && !isEnumValue(row.payment_terms, PAYMENT_TERMS)) {
    throw new Error("payment_terms is invalid");
  }
  if (row.reporting_frequency && !isEnumValue(row.reporting_frequency, REPORTING_FREQUENCIES)) {
    throw new Error("reporting_frequency is invalid");
  }

  const dateError = validateContractDates({
    startDate: row.start_date || null,
    endType: row.end_type,
    endDate: row.end_date || null,
  });
  if (dateError) throw new Error(dateError);
  const websiteError = validateHttpUrl(row.website_link);
  if (websiteError) throw new Error(websiteError);
  const documentError = validateHttpUrl(row.document_url);
  if (documentError) throw new Error(documentError.replace("websiteLink", "document_url"));
  const partnerWebsiteError = validateHttpUrl(row.partner_website);
  if (partnerWebsiteError) throw new Error(partnerWebsiteError.replace("websiteLink", "partner_website"));
  if (row.source_row && !/^\d+$/.test(row.source_row)) {
    throw new Error("source_row must be a positive integer");
  }

  const rawTerritories = row.territories ? row.territories.split(/[|,;]/) : [];
  const unknownTerritories = unrecognizedTerritories(rawTerritories);
  if (unknownTerritories.length) {
    throw new Error(`Unrecognized territories: ${unknownTerritories.join(", ")}`);
  }
  const rawDistributionTypes = row.distribution_types ? row.distribution_types.split(/[|,;]/) : [];
  const unknownDistributionTypes = unrecognizedDistributionTypes(rawDistributionTypes);
  if (unknownDistributionTypes.length) {
    throw new Error(`Unrecognized distribution types: ${unknownDistributionTypes.join(", ")}`);
  }

  return {
    direction: row.direction as "rights_in" | "rights_out",
    partnerName: row.partner_name.trim(),
    licensor: row.licensor || null,
    licensee: row.licensee || null,
    status: (row.status || "draft") as "draft" | "active" | "expired" | "in_perpetuity" | "terminated",
    startDate: row.start_date || null,
    endType: row.end_type as "date" | "perpetuity" | "auto_renew",
    endDate: row.end_date || null,
    territories: canonicalTerritories(rawTerritories),
    distributionTypes: canonicalDistributionTypes(rawDistributionTypes),
    platform: row.platform || null,
    royaltyType: (row.royalty_type || null) as "revenue_share" | "flat_fee" | "other" | null,
    royaltyDetails: row.royalty_details || null,
    paymentTerms: (row.payment_terms || null) as "net_30" | "net_60" | "net_90" | null,
    notes: row.notes || null,
    websiteLink: row.website_link || null,
    sourceKey: row.source_key || null,
    sourceSheet: row.source_sheet || null,
    sourceRow: row.source_row ? Number(row.source_row) : null,
    documentUrl: row.document_url || null,
    partnerWebsite: row.partner_website || null,
    partnerContacts: row.partner_contacts || null,
    contentTitles: uniqueByNormalized(
      splitPipe(row.content_titles),
      (title) => title.toLocaleLowerCase("en-US").replace(/\s+/g, " ").trim(),
    ),
    contentSeasons: uniqueByNormalized(splitPipe(row.content_seasons).map((reference) => {
      const match = reference.match(/^(.+?)::(\d+)$/);
      if (!match || Number(match[2]) < 1) {
        throw new Error(`Invalid content_seasons reference "${reference}"; use Title::SeasonNumber`);
      }
      return { title: match[1].trim(), seasonNumber: Number(match[2]) };
    }), (season) =>
      `${season.title.toLocaleLowerCase("en-US").replace(/\s+/g, " ").trim()}::${season.seasonNumber}`),
    reportingFrequency: row.reporting_frequency || null,
    reviewNotes: row.review_notes || null,
    rawSourceData: row.raw_source_data || null,
  };
}