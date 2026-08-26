import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ExcelJS from "exceljs";
import {
  CATALOG_IMPORT_HEADERS,
  parseCatalogImportWorkbook,
} from "./catalogImportCore.ts";

async function workbookBuffer(
  rows: Array<Array<string | number | Date | null>>,
  headers: readonly string[] = CATALOG_IMPORT_HEADERS,
) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Metadata");
  sheet.addRow(headers);
  rows.forEach((row) => sheet.addRow(row));
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

test("parses episodic and standalone catalog rows", async () => {
  const source = await workbookBuffer([
    ["Series", "series-1", 1, 2, "Episode", " Exact description ", "HD", "Drama", null, "A", 2024, "1/2/2024", "TV-G"],
    ["Film", "film-1", null, null, null, "Feature", "SD", "Family", null, null, 2020, null, "PG"],
  ]);
  const result = await parseCatalogImportWorkbook(source);

  assert.equal(result.records[0].kind, "episodic");
  assert.equal(result.records[0].releaseDate, "2024-01-02");
  assert.equal(result.records[0].description, " Exact description ");
  assert.equal(result.records[1].kind, "standalone");
  assert.equal(result.records[1].seasonNumber, null);
});

test("forward-fills Titles and retains invalid rows with row errors", async () => {
  const source = await workbookBuffer([
    ["Series", "one", 1, 1, "One", null, null, null, null, null, 2024, null, null],
    [null, "two", "zero", "bad", "Two", null, null, null, null, null, "2024.5", "2024-02-30", null],
    Array(13).fill(null),
  ]);
  const result = await parseCatalogImportWorkbook(source);

  assert.equal(result.records.length, 2);
  assert.equal(result.records[1].title, "Series");
  assert.equal(result.records[1].episodeNumberText, "bad");
  assert.equal(result.records[1].errors.length, 3);
  assert.deepEqual(result.errors.map((error) => error.field), ["Season", "Year Released", "Release Date"]);
});

test("rejects workbooks with missing or unknown Metadata headers", async () => {
  const headers = [...CATALOG_IMPORT_HEADERS.slice(0, -1), "Unexpected"];
  const source = await workbookBuffer([], headers);
  await assert.rejects(parseCatalogImportWorkbook(source), /Unrecognized columns: Unexpected.*Missing required columns: MPAA or TV Rating:/);
});

test("parses every populated row in the supplied TBN master catalog under 52 titles", async () => {
  const source = await readFile(new URL("../../../../attached_assets/TBN_Master_Catalog_1787773665940.xlsx", import.meta.url));
  const result = await parseCatalogImportWorkbook(source);
  assert.equal(result.records.length, 361);
  assert.equal(new Set(result.records.map((record) => record.title)).size, 52);
  assert.equal(result.errors.length, 0);
});