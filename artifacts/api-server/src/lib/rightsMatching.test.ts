import assert from "node:assert/strict";
import test from "node:test";
import { normalizeRightValue, territoriesCover, territoriesOverlap } from "./rightsMatching.ts";
import {
  distributionTypeContains,
  distributionTypesIntersect,
  isRecognizedDistributionType,
  isRecognizedTerritory,
  territoryStorageKeys,
  unrecognizedDistributionTypes,
  unrecognizedTerritories,
} from "./rightsVocabulary.ts";
import {
  normalizeContentType,
  normalizeRightsOutExclusivity,
} from "./rightsValidation.ts";

test("Global request overlaps a specific territorial grant", () => {
  assert.equal(territoriesOverlap("Global", ["US"]), true);
});

test("territory matching is case-insensitive", () => {
  assert.equal(territoriesOverlap("us", ["US"]), true);
  assert.equal(territoriesOverlap("US", ["us"]), true);
});

test("Global grant overlaps every requested territory", () => {
  assert.equal(territoriesOverlap("Canada", ["Global"]), true);
});

test("different specific territories do not overlap", () => {
  assert.equal(territoriesOverlap("Canada", ["US"]), false);
});

test("custom territories are normalized and included", () => {
  assert.equal(territoriesOverlap("emea", [], "Latin America, EMEA"), true);
});

test("distribution values normalize case and surrounding whitespace", () => {
  assert.equal(normalizeRightValue("  SVOD "), "svod");
});

test("regional hierarchy and distribution groupings match conservatively both ways", () => {
  assert.equal(territoriesOverlap("Europe", ["France"]), true);
  assert.equal(territoriesOverlap("France", ["Europe"]), true);
  assert.equal(territoriesOverlap("Europe", ["Canada"]), false);
  assert.equal(distributionTypesIntersect("VOD", "SVOD"), true);
  assert.equal(distributionTypesIntersect("Broadcast", "Linear"), true);
  assert.equal(distributionTypesIntersect("FAST", "SVOD"), false);
});

test("Rights In coverage is directional rather than a symmetric overlap", () => {
  assert.equal(territoriesCover("Global", ["United States"]), false);
  assert.equal(territoriesCover("United States", ["Global"]), true);
  assert.equal(territoriesCover("Europe", ["France"]), false);
  assert.equal(territoriesCover("France", ["Europe"]), true);
  assert.equal(distributionTypeContains("SVOD", "VOD"), false);
  assert.equal(distributionTypeContains("VOD", "SVOD"), true);
  assert.equal(distributionTypeContains("Linear Broadcast", "Broadcast"), false);
  assert.equal(distributionTypeContains("Broadcast", "Linear Broadcast"), true);
});

test("canonical rights values and documented aliases are recognized", () => {
  assert.equal(isRecognizedTerritory("United States"), true);
  assert.equal(isRecognizedTerritory("us"), true);
  assert.equal(isRecognizedTerritory("LATAM"), true);
  assert.equal(isRecognizedDistributionType("Linear"), true);
  assert.equal(isRecognizedDistributionType("Linear Broadcast"), true);
  assert.equal(isRecognizedDistributionType("Digital FAST Feed"), true);
  assert.equal(isRecognizedDistributionType("Linear COM Feed"), true);
  assert.equal(isRecognizedDistributionType("BD/DVD"), true);
});

test("territory filter storage keys include canonical and legacy aliases", () => {
  assert.deepEqual(
    new Set(territoryStorageKeys("Global")),
    new Set(["global", "worldwide", "world"]),
  );
  assert.ok(territoryStorageKeys("United States").includes("usa"));
});

test("unknown rights values are rejected by boundary validators", () => {
  assert.deepEqual(unrecognizedTerritories(["US", "Atlantis"]), ["Atlantis"]);
  assert.deepEqual(unrecognizedDistributionTypes(["SVOD", "Hologram"]), ["Hologram"]);
});

test("display-only content and exclusivity aliases normalize safely", () => {
  assert.equal(normalizeContentType("TV Series"), "TVSeries");
  assert.equal(normalizeContentType("tvseries"), undefined);
  assert.equal(normalizeContentType("Documentary"), undefined);
  assert.equal(normalizeRightsOutExclusivity("non-exclusive"), "non_exclusive");
  assert.equal(normalizeRightsOutExclusivity("non exclusive"), undefined);
  assert.equal(normalizeRightsOutExclusivity("exclusive"), "exclusive");
});