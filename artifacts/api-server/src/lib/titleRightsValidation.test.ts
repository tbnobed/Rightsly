import assert from "node:assert/strict";
import test from "node:test";
import { normalizeTitleRights } from "./validation.ts";

const base = {
  contentSource: "third_party",
  tbnMediaId: null,
  notes: null,
  broadcastRightsDuration: null,
  broadcastRightsTerm: null,
  digitalRightsDuration: null,
  digitalRightsTerm: null,
  internationalRightsDuration: null,
  internationalRightsTerm: null,
  internationalBroadcastAirAmount: null,
  youtubeRightsDuration: null,
  youtubeRightsTerm: null,
};

test("requires a TBN Media ID only for TBN content", () => {
  assert.match(normalizeTitleRights({ ...base, contentSource: "tbn" }).error ?? "", /required/);
  const tbn = normalizeTitleRights({ ...base, contentSource: "tbn", tbnMediaId: "  MEDIA-9  " });
  assert.equal(tbn.value?.tbnMediaId, "MEDIA-9");
  const thirdParty = normalizeTitleRights({ ...base, tbnMediaId: "ignored" });
  assert.equal(thirdParty.value?.tbnMediaId, null);
});

test("normalizes valid duration terms and independent air amount", () => {
  const result = normalizeTitleRights({
    ...base,
    broadcastRightsDuration: 6,
    broadcastRightsTerm: "months",
    digitalRightsTerm: "in_perpetuity",
    internationalRightsDuration: 1,
    internationalRightsTerm: "years",
    internationalBroadcastAirAmount: 4,
  });
  assert.deepEqual(
    {
      broadcast: [result.value?.broadcastRightsDuration, result.value?.broadcastRightsTerm],
      digital: [result.value?.digitalRightsDuration, result.value?.digitalRightsTerm],
      international: [result.value?.internationalRightsDuration, result.value?.internationalRightsTerm],
      airAmount: result.value?.internationalBroadcastAirAmount,
    },
    {
      broadcast: [6, "months"],
      digital: [null, "in_perpetuity"],
      international: [1, "years"],
      airAmount: 4,
    },
  );
});

test("rejects incomplete, fractional, and incompatible duration combinations", () => {
  assert.match(normalizeTitleRights({ ...base, broadcastRightsDuration: 6 }).error ?? "", /requires a term/);
  assert.match(normalizeTitleRights({ ...base, broadcastRightsTerm: "months" }).error ?? "", /positive whole number/);
  assert.match(normalizeTitleRights({ ...base, broadcastRightsDuration: 1.5, broadcastRightsTerm: "years" }).error ?? "", /positive whole number/);
  assert.match(normalizeTitleRights({ ...base, broadcastRightsDuration: 1, broadcastRightsTerm: "in_perpetuity" }).error ?? "", /must be blank/);
  assert.match(normalizeTitleRights({ ...base, internationalBroadcastAirAmount: 0 }).error ?? "", /positive whole number/);
});