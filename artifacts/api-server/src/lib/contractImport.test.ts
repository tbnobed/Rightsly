import assert from "node:assert/strict";
import test from "node:test";
import {
  IMPORT_HEADERS,
  REQUIRED_IMPORT_HEADERS,
  hasFinancialImportValues,
  normalizeContractImportRecord,
  parseContractImportCsv,
  previewContractImportRecords,
} from "./contractImportCore.ts";

const sample: Record<string, string> = {
  direction: "rights_in",
  partner_name: "Optional Fields Partner",
  licensor: "Licensor",
  licensee: "Licensee",
  status: "active",
  start_date: "2026-01-01",
  end_type: "perpetuity",
  end_date: "",
  territories: "United States",
  distribution_types: "SVOD",
  platform: "TBN+",
  royalty_type: "flat_fee",
  royalty_details: "Terms",
  payment_terms: "net_30",
  notes: "Notes",
  website_link: "https://example.com",
};

function csv(headers: readonly string[], row: Record<string, string>) {
  return `${headers.join(",")}\n${headers.map((header) => row[header] ?? "").join(",")}\n`;
}

test("contract import accepts only the required columns", () => {
  const [record] = parseContractImportCsv(csv(REQUIRED_IMPORT_HEADERS, sample));
  const normalized = normalizeContractImportRecord(record);
  assert.equal(normalized.partnerName, sample.partner_name);
  assert.equal(normalized.status, "draft");
  assert.deepEqual(normalized.territories, []);
  assert.deepEqual(normalized.distributionTypes, []);
});

test("contract import accepts omission of every optional column", () => {
  const optional = IMPORT_HEADERS.filter((header) =>
    !REQUIRED_IMPORT_HEADERS.includes(header as typeof REQUIRED_IMPORT_HEADERS[number]),
  );
  for (const omitted of optional) {
    const headers = IMPORT_HEADERS.filter((header) => header !== omitted);
    const [record] = parseContractImportCsv(csv(headers, sample));
    assert.doesNotThrow(() => normalizeContractImportRecord(record), omitted);
  }
});

test("contract import reports unknown and missing columns", () => {
  assert.throws(
    () => parseContractImportCsv("direction,partner_name,end_type,mystery\nrights_in,A,perpetuity,x\n"),
    /Unrecognized columns: mystery/,
  );
  assert.throws(
    () => parseContractImportCsv("direction,partner_name\nrights_in,A\n"),
    /Missing required columns: end_type/,
  );
});

test("financial import detection ignores empty optional cells", () => {
  assert.equal(hasFinancialImportValues([{
    direction: "rights_in",
    partner_name: "Legal import",
    end_type: "perpetuity",
    royalty_type: "",
    royalty_details: " ",
    payment_terms: "",
  }]), false);
  assert.equal(hasFinancialImportValues([{
    direction: "rights_out",
    partner_name: "Financial import",
    end_type: "perpetuity",
    royalty_details: "Revenue share terms",
  }]), true);
});

test("contract import rejects malformed optional values with clear errors", () => {
  const cases: Array<[string, Record<string, string>, RegExp]> = [
    ["status", { ...sample, status: "pending" }, /status is invalid/],
    ["royalty type", { ...sample, royalty_type: "percentage" }, /royalty_type is invalid/],
    ["payment terms", { ...sample, payment_terms: "net_15" }, /payment_terms is invalid/],
    ["website", { ...sample, website_link: "javascript:alert(1)" }, /must use HTTP or HTTPS/],
    ["territory", { ...sample, territories: "Atlantis" }, /Unrecognized territories/],
    ["distribution", { ...sample, distribution_types: "Unknown" }, /Unrecognized distribution types/],
    ["reporting frequency", { ...sample, reporting_frequency: "every other month" }, /reporting_frequency is invalid/],
  ];
  for (const [name, record, expected] of cases) {
    assert.throws(() => normalizeContractImportRecord(record), expected, name);
  }
});

test("expanded contract import parses source metadata and content references", () => {
  const normalized = normalizeContractImportRecord({
    ...sample,
    source_key: "legacy:contracts:2",
    source_sheet: "Contracts",
    source_row: "2",
    document_url: "https://example.com/contract.pdf",
    partner_website: "https://partner.example.com",
    partner_contacts: "Primary <primary@example.com>",
    content_titles: "Whole Title|Another Title",
    content_seasons: "Seasonal Title::1|Seasonal Title::2",
    reporting_frequency: "quarterly",
  });
  assert.equal(normalized.sourceKey, "legacy:contracts:2");
  assert.equal(normalized.sourceRow, 2);
  assert.equal(normalized.documentUrl, "https://example.com/contract.pdf");
  assert.deepEqual(normalized.contentTitles, ["Whole Title", "Another Title"]);
  assert.deepEqual(normalized.contentSeasons, [
    { title: "Seasonal Title", seasonNumber: 1 },
    { title: "Seasonal Title", seasonNumber: 2 },
  ]);
});

test("expanded contract import deduplicates normalized content and season references", () => {
  const normalized = normalizeContractImportRecord({
    ...sample,
    content_titles: "Show| show |SHOW",
    content_seasons: "Show::1| show ::1|SHOW::1",
  });
  assert.deepEqual(normalized.contentTitles, ["Show"]);
  assert.deepEqual(normalized.contentSeasons, [{ title: "Show", seasonNumber: 1 }]);
});

test("import preview separates ready, review, skipped, and invalid rows", () => {
  const preview = previewContractImportRecords([
    { direction: "rights_out", partner_name: "Ready", end_type: "perpetuity", source_key: "ready" },
    { import_action: "review", review_notes: "Confirm the territory" },
    { import_action: "skip", review_notes: "Operational row" },
    { direction: "rights_out", partner_name: "Broken", end_type: "unknown" },
  ]);
  assert.deepEqual(
    {
      total: preview.total,
      ready: preview.ready,
      review: preview.review,
      skipped: preview.skipped,
      invalid: preview.invalid,
    },
    { total: 4, ready: 1, review: 1, skipped: 1, invalid: 1 },
  );
  assert.match(preview.errors[0].message, /end_type/);
  assert.match(preview.warnings[0].message, /Confirm the territory/);
});

test("import preview rejects duplicate source keys and parser blocks formulas", () => {
  const preview = previewContractImportRecords([
    { direction: "rights_out", partner_name: "First", end_type: "perpetuity", source_key: "duplicate" },
    { direction: "rights_out", partner_name: "Second", end_type: "perpetuity", source_key: "duplicate" },
  ]);
  assert.equal(preview.ready, 1);
  assert.equal(preview.invalid, 1);
  assert.match(preview.errors[0].message, /Duplicate source_key/);
  assert.throws(
    () => parseContractImportCsv("direction,partner_name,end_type\nrights_out,=CMD(),perpetuity\n"),
    /Potential spreadsheet formula/,
  );
  assert.throws(
    () => parseContractImportCsv("direction,partner_name,end_type\nrights_out,-CMD(),perpetuity\n"),
    /Potential spreadsheet formula/,
  );
});