import { parse } from "csv-parse/sync";
import { validateContractDates } from "./contractDates.ts";
import {
  canonicalDistributionTypes,
  canonicalTerritories,
  unrecognizedDistributionTypes,
  unrecognizedTerritories,
} from "./rightsVocabulary.ts";
import { validateHttpUrl } from "./validation.ts";

export const IMPORT_HEADERS = [
  "direction", "partner_name", "licensor", "licensee", "status", "start_date",
  "end_type", "end_date", "territories", "distribution_types", "platform",
  "royalty_type", "royalty_details", "payment_terms", "notes", "website_link",
] as const;
export const REQUIRED_IMPORT_HEADERS = ["direction", "partner_name", "end_type"] as const;

export type ContractImportRecord = Record<string, string>;
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

  return (parse(source, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as ContractImportRecord[]).filter((row) =>
    Object.values(row).some((value) => value.trim().length > 0),
  );
}

export function normalizeContractImportRecord(row: ContractImportRecord) {
  if (!row.direction || !["rights_in", "rights_out"].includes(row.direction)) {
    throw new Error('direction must be "rights_in" or "rights_out"');
  }
  if (!row.partner_name) throw new Error("partner_name is required");
  if (!row.end_type || !["date", "perpetuity", "auto_renew"].includes(row.end_type)) {
    throw new Error('end_type must be "date", "perpetuity", or "auto_renew"');
  }
  if (row.status && !["draft", "active", "expired", "in_perpetuity", "terminated"].includes(row.status)) {
    throw new Error("status is invalid");
  }
  if (row.royalty_type && !["revenue_share", "flat_fee", "other"].includes(row.royalty_type)) {
    throw new Error("royalty_type is invalid");
  }
  if (row.payment_terms && !["net_30", "net_60", "net_90"].includes(row.payment_terms)) {
    throw new Error("payment_terms is invalid");
  }

  const dateError = validateContractDates({
    startDate: row.start_date || null,
    endType: row.end_type,
    endDate: row.end_date || null,
  });
  if (dateError) throw new Error(dateError);
  const websiteError = validateHttpUrl(row.website_link);
  if (websiteError) throw new Error(websiteError);

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
  };
}