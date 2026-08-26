import assert from "node:assert/strict";
import test from "node:test";
import { extractLegacyContactCandidates, normalizeContactEmail } from "./contactImport.ts";

test("extracts clear and ambiguous legacy contacts without changing source notes", () => {
  const notes = "Private note\nImported contacts (legacy:row:2): Ada Lovelace | ada@example.com | billing@example.com";
  const candidates = extractLegacyContactCandidates(
    [{ partnerId: "partner-1", company: "Example", notes }],
    [],
  );

  assert.equal(candidates.length, 2);
  assert.deepEqual(candidates.map(({ name, email }) => ({ name, email })), [
    { name: "Ada Lovelace", email: "ada@example.com" },
    { name: "Billing", email: "billing@example.com" },
  ]);
  assert.equal(candidates[0]?.ambiguous, true);
  assert.equal(candidates[1]?.ambiguous, true);
  assert.equal(notes.includes("Private note"), true);
});

test("marks matches by email and imported source key as duplicates", () => {
  const candidates = extractLegacyContactCandidates(
    [{
      partnerId: "partner-1",
      company: "Example",
      notes: "Imported contacts (legacy:row:2): Ada Lovelace | ada@example.com",
    }],
    [{ id: "contact-1", name: "Ada", email: "ADA@example.com", importSourceKey: null }],
  );
  assert.equal(candidates[0]?.duplicateContactId, "contact-1");
  assert.match(candidates[0]?.warnings.join(" ") ?? "", /duplicate/i);
});

test("candidate ids and source keys are stable across reruns", () => {
  const source = [{
    partnerId: "partner-1",
    company: "Example",
    notes: "Imported contacts (legacy:row:2): ada@example.com",
  }];
  const first = extractLegacyContactCandidates(source, []);
  const second = extractLegacyContactCandidates(source, []);
  assert.equal(first[0]?.id, second[0]?.id);
  assert.equal(first[0]?.sourceKey, second[0]?.sourceKey);
});

test("extracts multiline marker blocks and flags duplicates within the preview", () => {
  const candidates = extractLegacyContactCandidates([
    {
      partnerId: "partner-1",
      company: "First",
      notes: "Imported contacts (legacy:1): Ada Lovelace |\nada@example.com |\nbilling@example.com",
    },
    {
      partnerId: "partner-2",
      company: "Second",
      notes: "Imported contacts (legacy:2): Another Ada | ADA@example.com",
    },
  ], []);

  assert.deepEqual(candidates.map(({ email }) => email).sort(), [
    "ada@example.com",
    "ada@example.com",
    "billing@example.com",
  ]);
  const repeated = candidates.find((candidate) => candidate.company === "Second");
  assert.ok(repeated?.duplicateCandidateId);
  assert.match(repeated?.warnings.join(" ") ?? "", /duplicate candidate/i);
});

test("email normalization is shared across punctuation and case variants", () => {
  assert.equal(normalizeContactEmail(" ADA@Example.com, "), "ada@example.com");
  assert.equal(normalizeContactEmail("ada@example.com."), "ada@example.com");
});