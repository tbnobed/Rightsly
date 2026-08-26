import assert from "node:assert/strict";
import test from "node:test";
import { normalizeRightValue, territoriesOverlap } from "./rightsMatching.ts";
import {
  distributionTypesIntersect,
  isRecognizedDistributionType,
  isRecognizedTerritory,
  unrecognizedDistributionTypes,
  unrecognizedTerritories,
} from "./rightsVocabulary.ts";

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

test("canonical rights values and documented aliases are recognized", () => {
  assert.equal(isRecognizedTerritory("United States"), true);
  assert.equal(isRecognizedTerritory("us"), true);
  assert.equal(isRecognizedTerritory("LATAM"), true);
  assert.equal(isRecognizedDistributionType("Linear"), true);
  assert.equal(isRecognizedDistributionType("Linear Broadcast"), true);
});

test("unknown rights values are rejected by boundary validators", () => {
  assert.deepEqual(unrecognizedTerritories(["US", "Atlantis"]), ["Atlantis"]);
  assert.deepEqual(unrecognizedDistributionTypes(["SVOD", "Hologram"]), ["Hologram"]);
});