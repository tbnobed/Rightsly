import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("generated contract URLs preserve create and navigation endpoints", () => {
  return readFile(new URL("./generated/api.ts", import.meta.url), "utf8").then((source) => {
    assert.match(source, /getCreateContractUrl[\s\S]*?return `\/api\/contracts`/);
    assert.match(source, /getGetContractFilterOptionsUrl[\s\S]*?`\/api\/contracts\/filter-options/);
    assert.match(source, /getListContractsUrl[\s\S]*?`\/api\/contracts\?\$\{stringifiedParams\}`/);
  });
});