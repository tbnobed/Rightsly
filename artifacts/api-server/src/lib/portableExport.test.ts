import assert from "node:assert/strict";
import test from "node:test";
import {
  portableExportFileNamesForRole, PORTABLE_EXPORT_FILE_NAMES, PORTABLE_SECRET_FIELDS,
  sanitizePortableRecord, serializePortableCsv,
} from "./portableExportCore.ts";
import { roleHasPermission } from "./rolePolicy.ts";

test("portable export covers every current application table exactly once", () => {
  const files = PORTABLE_EXPORT_FILE_NAMES;
  assert.equal(files.length, 15);
  assert.equal(new Set(files).size, files.length);
  assert.deepEqual(files, [...files].sort());
});

test("portable users CSV excludes password and invitation token hashes", () => {
  assert.deepEqual(PORTABLE_SECRET_FIELDS, ["passwordHash", "inviteTokenHash"]);
  const record = sanitizePortableRecord({
    afterSummary: JSON.stringify({ name: "A", passwordHash: "hash", nested: { inviteTokenHash: "token" } }),
  });
  assert.equal(record.afterSummary, '{"name":"A","nested":{}}');
});

test("portable CSV is stable and formula-safe", () => {
  const csv = serializePortableCsv(["id", "name", "tags"], [
    { id: "b", name: "=SUM(A1:A2)", tags: ["one", "two"] },
  ]);
  assert.equal(csv, '"id","name","tags"\n"b","\'=SUM(A1:A2)","[""one"",""two""]"\n');
});

test("only Admin and Content Admin can request portable export", () => {
  assert.equal(roleHasPermission("admin", ["admin", "content_admin"]), true);
  assert.equal(roleHasPermission("content_admin", ["admin", "content_admin"]), true);
  assert.equal(roleHasPermission("legal", ["admin", "content_admin"]), false);
  assert.equal(roleHasPermission("finance", ["admin", "content_admin"]), false);
  assert.equal(roleHasPermission("sales", ["admin", "content_admin"]), false);
});

test("content admin export cannot bypass Users and Audit Log restrictions", () => {
  const adminFiles = portableExportFileNamesForRole("admin");
  const contentAdminFiles = portableExportFileNamesForRole("content_admin");

  assert.equal(adminFiles.length, 15);
  assert.equal(adminFiles.includes("users.csv"), true);
  assert.equal(adminFiles.includes("audit_logs.csv"), true);
  assert.equal(contentAdminFiles.length, 13);
  assert.equal(contentAdminFiles.includes("users.csv"), false);
  assert.equal(contentAdminFiles.includes("audit_logs.csv"), false);
});