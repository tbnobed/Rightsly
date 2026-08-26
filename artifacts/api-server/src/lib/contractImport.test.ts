import assert from "node:assert/strict";
import test from "node:test";
import {
  IMPORT_HEADERS,
  REQUIRED_IMPORT_HEADERS,
  hasFinancialImportValues,
  normalizeContractImportRecord,
  parseContractImportCsv,
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
  ];
  for (const [name, record, expected] of cases) {
    assert.throws(() => normalizeContractImportRecord(record), expected, name);
  }
});