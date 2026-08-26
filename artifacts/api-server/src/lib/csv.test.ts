import assert from "node:assert/strict";
import test from "node:test";
import { csvCell } from "./csv.ts";

test("csvCell quotes delimiters and neutralizes spreadsheet formulas", () => {
  assert.equal(csvCell('a,"b"\nnext'), '"a,""b""\nnext"');
  assert.equal(csvCell("=SUM(A1:A2)"), `"'=SUM(A1:A2)"`);
  assert.equal(csvCell(" \t-10"), `"\' \t-10"`);
});