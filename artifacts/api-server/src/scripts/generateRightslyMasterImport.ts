import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import {
  IMPORT_HEADERS,
  parseContractImportCsv,
  type ContractImportRecord,
} from "../lib/contractImportCore.ts";
import { previewContractImportRecords } from "../lib/contractImport.ts";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const DEFAULT_INPUT = path.join(
  workspaceRoot,
  "attached_assets/Digital_Licensing_&_Distribution_Master_Sheet_1787758972878.xlsx",
);
const DEFAULT_OUTPUT = path.join(workspaceRoot, "attached_assets/rightsly-master-import.csv");

type MasterRow = ContractImportRecord;

function text(cell: ExcelJS.Cell) {
  const value = cell.value;
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("text" in value) return String(value.text ?? "").trim();
    if ("result" in value) return String(value.result ?? "").trim();
    if ("formula" in value) return String(value.result ?? value.formula ?? "").trim();
    if ("richText" in value) {
      return value.richText.map((part) => part.text).join("").trim();
    }
  }
  return String(value).trim();
}

function hyperlink(cell: ExcelJS.Cell) {
  const value = cell.value;
  return value && typeof value === "object" && "hyperlink" in value
    ? String(value.hyperlink ?? "").trim()
    : "";
}

function emptyRow(): MasterRow {
  return Object.fromEntries(IMPORT_HEADERS.map((header) => [header, ""]));
}

function append(value: string, addition: string) {
  return [value, addition].filter(Boolean).join("\n");
}

function sourceKey(sheet: string, row: number) {
  return `digital-licensing-master:${sheet}:${row}`;
}

function parseDateText(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const match = value.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
  if (!match) return "";
  const year = Number(match[3]) < 100 ? 2000 + Number(match[3]) : Number(match[3]);
  const month = Number(match[1]);
  const day = Number(match[2]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function normalizeExpiration(raw: string) {
  const lower = raw.toLowerCase();
  const parsedDate = parseDateText(raw);
  if (parsedDate) return { endType: "date", endDate: parsedDate, warning: "" };
  if (/\bperpetu(?:al|ity)\b/.test(lower)) {
    return { endType: "perpetuity", endDate: "", warning: "" };
  }
  if (/auto.?renew|automatically renew|renewal period/.test(lower)) {
    return { endType: "auto_renew", endDate: "", warning: "" };
  }
  return {
    endType: "",
    endDate: "",
    warning: raw
      ? `Expiration language requires review: ${raw}`
      : "Missing expiration/end-type information",
  };
}

const territoryMap: Record<string, string> = {
  WW: "Global",
  WORLDWIDE: "Global",
  GLOBAL: "Global",
  US: "United States",
  USA: "United States",
  "UNITED STATES": "United States",
  UK: "United Kingdom",
  "UNITED KINGDOM": "United Kingdom",
  CA: "Canada",
  CANADA: "Canada",
  MX: "Mexico",
  MEXICO: "Mexico",
  BR: "Brazil",
  BRAZIL: "Brazil",
  AU: "Australia",
  AUSTRALIA: "Australia",
  NZ: "New Zealand",
  "NEW ZEALAND": "New Zealand",
  JP: "Japan",
  JAPAN: "Japan",
  FR: "France",
  FRANCE: "France",
  DE: "Germany",
  GERMANY: "Germany",
  IT: "Italy",
  ITALY: "Italy",
  ES: "Spain",
  SPAIN: "Spain",
  INDIA: "India",
};

function normalizeTerritories(raw: string) {
  const values = raw.split(/\s*(?:,|\/|;|\||\band\b)\s*/i).filter(Boolean);
  const recognized: string[] = [];
  const unknown: string[] = [];
  for (const value of values) {
    const mapped = territoryMap[value.trim().toUpperCase()];
    if (mapped) recognized.push(mapped);
    else unknown.push(value.trim());
  }
  return {
    territories: [...new Set(recognized)].join("|"),
    warning: unknown.length ? `Unmapped territories: ${unknown.join(", ")}` : "",
  };
}

function normalizeStatus(raw: string, sheet: string) {
  const status = raw.toLowerCase();
  if (status === "active" || status === "complete") return { value: "active", warning: "" };
  if (status === "terminated" || sheet === "Terminated Contracts") {
    return { value: "terminated", warning: "" };
  }
  if (status === "expired") return { value: "expired", warning: "" };
  if (status === "dormant" || sheet === "Dormant Partners") {
    return { value: "draft", warning: "Dormant partner was retained as a draft contract for review" };
  }
  return {
    value: "draft",
    warning: raw ? `Source status "${raw}" was retained as draft` : "Missing status was retained as draft",
  };
}

function normalizeDeal(raw: string) {
  if (!raw || raw === "-") return { royaltyType: "", details: "", warning: "" };
  const number = Number(raw);
  if (Number.isFinite(number) && number >= 0 && number <= 1) {
    return {
      royaltyType: "revenue_share",
      details: `${(number * 100).toFixed(2).replace(/\.00$/, "")}% revenue share`,
      warning: "",
    };
  }
  const percentage = raw.match(/(\d+(?:\.\d+)?)\s*%/);
  if (percentage) {
    return {
      royaltyType: "revenue_share",
      details: `${percentage[1]}% revenue share; source value: ${raw}`,
      warning: "",
    };
  }
  return {
    royaltyType: "",
    details: "",
    warning: `Deal terms were preserved in notes and require financial review: ${raw}`,
  };
}

function normalizeRevenue(raw: string) {
  if (!raw) return { royaltyType: "", details: "", warning: "" };
  const numeric = Number(raw.replaceAll(/[$,]/g, ""));
  if (Number.isFinite(numeric)) {
    return {
      royaltyType: "flat_fee",
      details: `$${numeric.toFixed(2)} source licensing revenue`,
      warning: "",
    };
  }
  return normalizeDeal(raw);
}

function normalizePaymentTerms(raw: string) {
  const match = raw.toLowerCase().match(/\bnet\s*(30|60|90)\b/);
  return match ? `net_${match[1]}` : "";
}

function normalizeReportingFrequency(raw: string) {
  const value = raw.trim().toLowerCase();
  if (/\bmonth(?:ly)?\b/.test(value)) return "monthly";
  if (/\bquarter(?:ly)?\b|\bqtr\b/.test(value)) return "quarterly";
  if (/\bannual(?:ly)?\b|\byearly\b/.test(value)) return "annually";
  return "";
}

function parseContent(raw: string) {
  const titles: string[] = [];
  const seasons: string[] = [];
  for (const segment of raw.split(/\s*\/\s*|\s*;\s*/).map((item) => item.trim()).filter(Boolean)) {
    const seasonMatch = segment.match(/^(.+?)\s+S(?:eason)?\s*(\d+(?:\s*[,&]\s*\d+)*)\b/i);
    if (seasonMatch) {
      const title = seasonMatch[1].trim();
      for (const season of seasonMatch[2].split(/\s*[,&]\s*/).map(Number).filter((value) => value > 0)) {
        seasons.push(`${title}::${season}`);
      }
    } else {
      titles.push(segment);
    }
  }
  return {
    titles: [...new Set(titles)].join("|"),
    seasons: [...new Set(seasons)].join("|"),
  };
}

function rawJson(headers: string[], values: string[]) {
  return JSON.stringify(Object.fromEntries(headers.map((header, index) => [header || `column_${index + 1}`, values[index] ?? ""])));
}

function contactSummary(values: string[]) {
  return values.filter(Boolean).join(" | ");
}

function rowBase(sheet: ExcelJS.Worksheet, rowNumber: number, headers: string[], values: string[]) {
  const row = emptyRow();
  row.source_key = sourceKey(sheet.name, rowNumber);
  row.source_sheet = sheet.name;
  row.source_row = String(rowNumber);
  row.raw_source_data = rawJson(headers, values);
  return row;
}

function contractRow(
  sheet: ExcelJS.Worksheet,
  rowNumber: number,
  headers: string[],
  values: string[],
): MasterRow {
  const row = rowBase(sheet, rowNumber, headers, values);
  const warnings: string[] = [];
  const get = (index: number) => values[index - 1] ?? "";
  const link = (index: number) => hyperlink(sheet.getRow(rowNumber).getCell(index));
  let platform = "";
  let sourceStatus = "";
  let content = "";
  let territory = "";
  let deal = "";
  let payout = "";
  let contractType = "";
  let contractDate = "";
  let expiration = "";
  let documentUrl = "";
  let website = "";
  let contacts = "";
  let sourceNotes = "";
  let distributionTypes = "";

  if (sheet.name === "FAST Contracts") {
    platform = get(1); sourceStatus = get(2); content = get(3); territory = get(4);
    deal = get(5); payout = ""; contractType = get(7); contractDate = get(8);
    expiration = get(9); documentUrl = link(10); website = get(16);
    contacts = contactSummary([get(11), get(12), get(13), get(14), get(15)]);
    sourceNotes = get(17); distributionTypes = "FAST";
    if (get(6)) sourceNotes = append(sourceNotes, `Distribution point: ${get(6)}`);
  } else if (["VOD Contracts", "Terminated Contracts", "Dormant Partners"].includes(sheet.name)) {
    platform = get(1); sourceStatus = get(2); content = get(3); territory = get(4);
    deal = get(5); payout = get(6); contractType = get(7); contractDate = get(8);
    expiration = get(9); documentUrl = link(10); website = get(11);
    contacts = contactSummary([get(12), get(13), get(14), get(15)]);
    sourceNotes = get(16); distributionTypes = "VOD";
  } else if (sheet.name === "Missional Contracts") {
    platform = get(1); sourceStatus = get(2); content = get(3); deal = get(4);
    territory = get(5); payout = get(7); contacts = contactSummary([get(8), get(9), get(10), get(11)]);
    contractType = get(12); contractDate = get(13); expiration = get(14);
    documentUrl = link(15); sourceNotes = get(16); distributionTypes = "Broadcast";
    if (get(6)) sourceNotes = append(sourceNotes, `FAST channels: ${get(6)}`);
  } else if (sheet.name === "Translation Contracts") {
    platform = get(1); sourceStatus = get(2); content = get(3); deal = get(4);
    payout = get(5); contacts = contactSummary([get(6), get(7), get(8), get(9)]);
    contractType = get(10); contractDate = get(11); expiration = get(12);
    documentUrl = link(13); sourceNotes = get(14);
  } else {
    platform = get(1); contractDate = get(3) || get(2); expiration = get(4);
    deal = get(5); distributionTypes = get(6); territory = get(7);
    sourceStatus = get(8); content = get(9); contacts = get(10); sourceNotes = get(11);
    documentUrl = link(1);
  }

  if (
    !platform ||
    platform.toLowerCase() === "platform" ||
    (sourceStatus.toLowerCase() === "agreement status" && content.toLowerCase() === "content")
  ) {
    row.import_action = "skip";
    row.review_notes = "Blank or repeated workbook header row";
    return row;
  }

  const status = normalizeStatus(sourceStatus, sheet.name);
  const end = normalizeExpiration(expiration);
  const territories = normalizeTerritories(territory);
  const financial = sheet.name === "2026 Licensing Deals" ? normalizeRevenue(deal) : normalizeDeal(deal);
  const parsedContent = parseContent(content);
  warnings.push(status.warning, end.warning, territories.warning, financial.warning);

  row.direction = "rights_out";
  row.partner_name = platform;
  row.licensor = "TBN";
  row.licensee = platform;
  row.status = status.value;
  row.start_date = parseDateText(contractDate);
  row.end_type = end.endType;
  row.end_date = end.endDate;
  row.territories = territories.territories;
  row.distribution_types = distributionTypes;
  row.platform = platform;
  row.royalty_type = financial.royaltyType;
  row.royalty_details = financial.details;
  row.payment_terms = normalizePaymentTerms(payout);
  row.document_url = documentUrl;
  row.partner_website = website.startsWith("http") ? website : "";
  row.website_link = row.partner_website;
  row.partner_contacts = contacts;
  row.content_titles = parsedContent.titles;
  row.content_seasons = parsedContent.seasons;
  row.reporting_frequency = normalizeReportingFrequency(payout);
  row.notes = [
    sourceNotes,
    contractType ? `Source contract type: ${contractType}` : "",
    content ? `Source content/feed scope: ${content}` : "",
    deal ? `Source deal terms: ${deal}` : "",
    payout ? `Source payout schedule: ${payout}` : "",
    expiration ? `Source expiration: ${expiration}` : "",
  ].filter(Boolean).join("\n");

  const requiresReview =
    sheet.name === "Translation Contracts" ||
    sheet.name === "Dormant Partners" ||
    !row.end_type ||
    !row.territories ||
    Boolean(territories.warning);
  row.import_action = requiresReview ? "review" : "import";
  if (sheet.name === "Translation Contracts") {
    warnings.push("Translation/vendor service agreements are not imported as media-rights contracts");
  }
  row.review_notes = warnings.filter(Boolean).join("; ");
  return row;
}

function normalizedPartner(value: string) {
  return value.toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, " ").trim();
}

function csvCell(value: string) {
  const safe = /^[=+@-]/.test(value.trimStart()) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

async function main() {
  const input = path.resolve(process.argv[2] ?? DEFAULT_INPUT);
  const output = path.resolve(process.argv[3] ?? DEFAULT_OUTPUT);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(input);
  const rows: MasterRow[] = [];
  const contractRows: MasterRow[] = [];

  for (const sheet of workbook.worksheets) {
    const headers: string[] = [];
    sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, column) => {
      headers[column - 1] = text(cell);
    });
    while (headers.length && !headers.at(-1)) headers.pop();

    if (sheet.name === "Dashboards & Logins") {
      const row = emptyRow();
      row.source_key = "digital-licensing-master:Dashboards & Logins";
      row.source_sheet = sheet.name;
      row.import_action = "skip";
      row.review_notes = `${Math.max(sheet.rowCount - 1, 0)} credential rows excluded for security; no usernames or passwords were copied`;
      rows.push(row);
      continue;
    }

    if (["Payment Tracking", "Email List & Tracking Notes"].includes(sheet.name)) continue;
    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
      const values = headers.map((_, index) => text(sheet.getRow(rowNumber).getCell(index + 1)));
      if (values.every((value) => !value)) continue;
      const converted = contractRow(sheet, rowNumber, headers, values);
      rows.push(converted);
      if (converted.partner_name && converted.import_action !== "skip") contractRows.push(converted);
    }
  }

  const byPartner = new Map<string, MasterRow[]>();
  for (const row of contractRows) {
    const key = normalizedPartner(row.partner_name);
    byPartner.set(key, [...(byPartner.get(key) ?? []), row]);
  }

  for (const sheetName of ["Payment Tracking", "Email List & Tracking Notes"]) {
    const sheet = workbook.getWorksheet(sheetName);
    if (!sheet) continue;
    const headers: string[] = [];
    sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, column) => {
      headers[column - 1] = text(cell);
    });
    while (headers.length && !headers.at(-1)) headers.pop();
    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
      const values = headers.map((_, index) => text(sheet.getRow(rowNumber).getCell(index + 1)));
      if (values.every((value) => !value)) continue;
      const partner = sheetName === "Payment Tracking" ? values[1] : values[0];
      const matches = byPartner.get(normalizedPartner(partner ?? "")) ?? [];
      const operationalSummary = headers
        .map((header, index) => values[index] ? `${header}: ${values[index]}` : "")
        .filter(Boolean)
        .join("; ");
      if (matches.length) {
        const target = matches[0];
        target.notes = append(target.notes, `${sheetName} row ${rowNumber}: ${operationalSummary}`);
        if (sheetName === "Email List & Tracking Notes") {
          target.partner_contacts = contactSummary([
            target.partner_contacts,
            values[1],
            values[2],
            values[3],
          ]);
        }
      }
      const operational = rowBase(sheet, rowNumber, headers, values);
      operational.partner_name = partner ?? "";
      operational.import_action = "skip";
      operational.review_notes = matches.length
        ? `${sheetName} data was merged into ${matches[0].source_key}`
        : `${sheetName} data could not be matched deterministically to a contract and remains in raw_source_data`;
      rows.push(operational);
    }
  }

  const render = () => [
    IMPORT_HEADERS.map(csvCell).join(","),
    ...rows.map((row) => IMPORT_HEADERS.map((header) => csvCell(row[header] ?? "")).join(",")),
  ].join("\n");
  const source = render();
  const parsed = parseContractImportCsv(source);
  const preview = await previewContractImportRecords(parsed);
  if (preview.invalid) {
    throw new Error(`Generated CSV failed validation: ${JSON.stringify(preview.errors)}`);
  }
  await fs.writeFile(output, `${source}\n`, "utf8");
  process.stdout.write(JSON.stringify({ output, ...preview }, null, 2) + "\n");
}

await main();