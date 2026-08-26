import ExcelJS from "exceljs";

export const CATALOG_IMPORT_HEADERS = [
  "Titles",
  "Internal ID",
  "Season",
  "Episode #",
  "Episode Title",
  "Description",
  "HD, SD, or Both",
  "Genre(s)",
  "Director",
  "Actors",
  "Year Released",
  "Release Date",
  "MPAA or TV Rating:",
] as const;

export type CatalogImportHeader = typeof CATALOG_IMPORT_HEADERS[number];
export type CatalogRecordKind = "episodic" | "standalone";

export type CatalogImportIssue = {
  row: number;
  field?: CatalogImportHeader;
  message: string;
};

/**
 * A parsed source row.  This intentionally retains source-oriented fields and
 * row errors so a preview service can show every submitted row before it
 * decides which records may be persisted.
 */
export type CatalogImportRecord = {
  sourceRow: number;
  kind: CatalogRecordKind;
  title: string | null;
  internalId: string | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  episodeNumberText: string | null;
  episodeTitle: string | null;
  description: string | null;
  format: string | null;
  genres: string | null;
  director: string | null;
  actors: string | null;
  yearReleased: number | null;
  releaseDate: string | null;
  rating: string | null;
  errors: CatalogImportIssue[];
};

export type CatalogImportParseResult = {
  records: CatalogImportRecord[];
  errors: CatalogImportIssue[];
};

type Input = Buffer | ArrayBuffer | Uint8Array;

function isBlank(value: string) {
  return value.trim().length === 0;
}

function cellText(cell: ExcelJS.Cell): string {
  if (cell.value == null) return "";
  return cell.text;
}

function nullableText(value: string): string | null {
  return isBlank(value) ? null : value;
}

function positiveInteger(value: string, row: number, field: CatalogImportHeader, issues: CatalogImportIssue[]): number | null {
  if (isBlank(value)) return null;
  const normalized = value.trim();
  if (!/^\d+(?:\.0+)?$/.test(normalized) || Number(normalized) < 1 || !Number.isSafeInteger(Number(normalized))) {
    issues.push({ row, field, message: `${field} must be a positive integer` });
    return null;
  }
  return Number(normalized);
}

function dateFromParts(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

function normalizedReleaseDate(
  cell: ExcelJS.Cell,
  row: number,
  issues: CatalogImportIssue[],
): string | null {
  if (cell.value == null || isBlank(cellText(cell))) return null;

  const raw = cellText(cell).trim();
  const value = cell.value;
  let normalized: string | null = null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    normalized = dateFromParts(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  } else if (typeof value === "number" && Number.isFinite(value)) {
    // Excel's 1900 date system includes its historical leap-year offset.
    const date = new Date(Date.UTC(1899, 11, 30) + Math.round(value * 86_400_000));
    normalized = dateFromParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  } else {
    const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    const us = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (iso) normalized = dateFromParts(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    else if (us) normalized = dateFromParts(Number(us[3]), Number(us[1]), Number(us[2]));
    else {
      const timestamp = Date.parse(raw);
      if (!Number.isNaN(timestamp)) {
        const date = new Date(timestamp);
        normalized = dateFromParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
      }
    }
  }

  if (!normalized) {
    issues.push({ row, field: "Release Date", message: "Release Date must be a valid date" });
  }
  return normalized;
}

function validateHeaders(sheet: ExcelJS.Worksheet): Map<CatalogImportHeader, number> {
  const found = new Map<string, number>();
  const duplicates: string[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, column) => {
    const header = cellText(cell).trim();
    if (!header) return;
    if (found.has(header)) duplicates.push(header);
    else found.set(header, column);
  });

  const expected = new Set<string>(CATALOG_IMPORT_HEADERS);
  const unknown = [...found.keys()].filter((header) => !expected.has(header));
  const missing = CATALOG_IMPORT_HEADERS.filter((header) => !found.has(header));
  if (unknown.length || missing.length || duplicates.length) {
    const details = [
      unknown.length ? `Unrecognized columns: ${unknown.join(", ")}` : "",
      missing.length ? `Missing required columns: ${missing.join(", ")}` : "",
      duplicates.length ? `Duplicate columns: ${duplicates.join(", ")}` : "",
    ].filter(Boolean);
    throw new Error(details.join("; "));
  }
  return new Map(CATALOG_IMPORT_HEADERS.map((header) => [header, found.get(header)!]));
}

/** Parse the Metadata sheet without performing any database work. */
export async function parseCatalogImportWorkbook(input: Input): Promise<CatalogImportParseResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(input as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const sheet = workbook.getWorksheet("Metadata");
  if (!sheet) throw new Error('Missing required worksheet: Metadata');

  const columns = validateHeaders(sheet);
  const records: CatalogImportRecord[] = [];
  const errors: CatalogImportIssue[] = [];
  let previousTitle: string | null = null;

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const values = new Map<CatalogImportHeader, string>();
    for (const header of CATALOG_IMPORT_HEADERS) {
      values.set(header, cellText(row.getCell(columns.get(header)!)));
    }
    if ([...values.values()].every(isBlank)) continue;

    const rowIssues: CatalogImportIssue[] = [];
    const suppliedTitle = values.get("Titles")!;
    if (!isBlank(suppliedTitle)) previousTitle = suppliedTitle;
    const title = previousTitle;
    if (!title) rowIssues.push({ row: rowNumber, field: "Titles", message: "Titles is required" });

    const seasonNumber = positiveInteger(values.get("Season")!, rowNumber, "Season", rowIssues);
    const episodeNumberText = nullableText(values.get("Episode #")!);
    const episodeNumber = episodeNumberText && /^\d+(?:\.0+)?$/.test(episodeNumberText.trim())
      ? positiveInteger(episodeNumberText, rowNumber, "Episode #", rowIssues)
      : null;
    const episodeTitle = nullableText(values.get("Episode Title")!);
    const record: CatalogImportRecord = {
      sourceRow: rowNumber,
      kind: seasonNumber !== null || episodeNumber !== null || episodeTitle !== null ? "episodic" : "standalone",
      title,
      internalId: nullableText(values.get("Internal ID")!),
      seasonNumber,
      episodeNumber,
      episodeNumberText,
      episodeTitle,
      description: nullableText(values.get("Description")!),
      format: nullableText(values.get("HD, SD, or Both")!),
      genres: nullableText(values.get("Genre(s)")!),
      director: nullableText(values.get("Director")!),
      actors: nullableText(values.get("Actors")!),
      yearReleased: positiveInteger(values.get("Year Released")!, rowNumber, "Year Released", rowIssues),
      releaseDate: normalizedReleaseDate(row.getCell(columns.get("Release Date")!), rowNumber, rowIssues),
      rating: nullableText(values.get("MPAA or TV Rating:")!),
      errors: rowIssues,
    };
    records.push(record);
    errors.push(...rowIssues);
  }

  return { records, errors };
}

// Kept as a concise name for callers whose upload endpoint is XLSX-specific.
export const parseCatalogImportXlsx = parseCatalogImportWorkbook;
