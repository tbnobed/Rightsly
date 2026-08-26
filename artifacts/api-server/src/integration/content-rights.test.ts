import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";
import { createRequire } from "node:module";

const apiRequire = createRequire(new URL("../../package.json", import.meta.url));
const dbRequire = createRequire(new URL("../../../../lib/db/package.json", import.meta.url));
const bcrypt = apiRequire("bcryptjs") as typeof import("bcryptjs");
const { Pool } = dbRequire("pg");

test("title rights persist and enforce source and duration rules", async () => {
  const pool = new Pool({ connectionString: process.env["DATABASE_URL"] });
  const suffix = crypto.randomBytes(6).toString("hex");
  const legalId = crypto.randomUUID();
  const salesId = crypto.randomUUID();
  const legacyContentId = crypto.randomUUID();
  const partnerId = crypto.randomUUID();
  const contractId = crypto.randomUUID();
  const password = crypto.randomBytes(18).toString("base64url");
  const legalEmail = `rights-legal-${suffix}@example.invalid`;
  const salesEmail = `rights-sales-${suffix}@example.invalid`;
  let contentId: string | null = null;

  const login = async (email: string) => {
    const response = await fetch("http://localhost:8080/api/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    assert.equal(response.status, 200);
    return (await response.json() as { token: string }).token;
  };
  const headers = (token: string) => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` });

  try {
    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      `INSERT INTO users (id, email, name, role, password_hash, is_active) VALUES
       ($1, $2, 'Rights Legal', 'legal', $3, true),
       ($4, $5, 'Rights Sales', 'sales', $3, true)`,
      [legalId, legalEmail, hash, salesId, salesEmail],
    );
    await pool.query(
      "INSERT INTO content_items (id, type, title) VALUES ($1, 'Film', $2)",
      [legacyContentId, `Legacy title ${suffix}`],
    );
    await pool.query(
      "INSERT INTO partners (id, name, type) VALUES ($1, $2, 'Licensor')",
      [partnerId, `Rights partner ${suffix}`],
    );
    const legalToken = await login(legalEmail);
    const salesToken = await login(salesEmail);
    const legacyUpdate = await fetch(`http://localhost:8080/api/content/${legacyContentId}`, {
      method: "PUT", headers: headers(legalToken),
      body: JSON.stringify({ title: `Legacy title updated ${suffix}`, hasCaptions: true }),
    });
    assert.equal(legacyUpdate.status, 200);
    const legacyItem = await legacyUpdate.json() as { contentSource: null; hasCaptions: boolean };
    assert.equal(legacyItem.contentSource, null);
    assert.equal(legacyItem.hasCaptions, true);
    const payload = {
      title: `Rights title ${suffix}`,
      type: "Film",
      contentSource: "tbn",
      tbnMediaId: `MEDIA-${suffix}`,
      notes: "Operational rights summary",
      broadcastRightsDuration: 6,
      broadcastRightsTerm: "months",
      digitalRightsDuration: null,
      digitalRightsTerm: "in_perpetuity",
      internationalRightsDuration: 1,
      internationalRightsTerm: "years",
      internationalBroadcastAirAmount: 4,
      youtubeRightsDuration: 3,
      youtubeRightsTerm: null,
      youtubeRightsCustomTerm: "Weeks",
    };
    const denied = await fetch("http://localhost:8080/api/content", {
      method: "POST", headers: headers(salesToken), body: JSON.stringify(payload),
    });
    assert.equal(denied.status, 403);

    const created = await fetch("http://localhost:8080/api/content", {
      method: "POST", headers: headers(legalToken), body: JSON.stringify(payload),
    });
    assert.equal(created.status, 201);
    const item = await created.json() as {
      id: string;
      tbnMediaId: string;
      digitalRightsTerm: string;
      youtubeRightsDuration: number;
      youtubeRightsTerm: null;
      youtubeRightsCustomTerm: string;
    };
    contentId = item.id;
    assert.equal(item.tbnMediaId, `MEDIA-${suffix}`);
    assert.equal(item.digitalRightsTerm, "in_perpetuity");
    assert.equal(item.youtubeRightsDuration, 3);
    assert.equal(item.youtubeRightsTerm, null);
    assert.equal(item.youtubeRightsCustomTerm, "Weeks");
    await pool.query(
      `INSERT INTO contracts (id, direction, partner_id, status, start_date, end_type, end_date)
       VALUES ($1, 'rights_in', $2, 'active', '2026-01-01', 'date', '2027-01-01')`,
      [contractId, partnerId],
    );
    await pool.query(
      "INSERT INTO contract_content (contract_id, content_item_id) VALUES ($1, $2)",
      [contractId, contentId],
    );
    const contractResponse = await fetch(`http://localhost:8080/api/contracts/${contractId}`, {
      headers: headers(legalToken),
    });
    assert.equal(contractResponse.status, 200);
    const contract = await contractResponse.json() as { contentItems: Array<Record<string, unknown>> };
    assert.deepEqual(contract.contentItems[0], {
      id: contentId,
      type: "Film",
      title: payload.title,
      year: null,
    });

    const listed = await fetch(`http://localhost:8080/api/content?search=${encodeURIComponent(payload.title)}`, {
      headers: headers(salesToken),
    });
    assert.equal(listed.status, 200);
    const listBody = await listed.json() as { data: Array<{ contentSource: string; internationalBroadcastAirAmount: number }> };
    assert.equal(listBody.data[0]?.contentSource, "tbn");
    assert.equal(listBody.data[0]?.internationalBroadcastAirAmount, 4);

    const invalid = await fetch(`http://localhost:8080/api/content/${contentId}`, {
      method: "PUT", headers: headers(legalToken),
      body: JSON.stringify({ broadcastRightsDuration: 2, broadcastRightsTerm: "in_perpetuity" }),
    });
    assert.equal(invalid.status, 400);
    assert.match((await invalid.json() as { message: string }).message, /must be blank/);

    const updated = await fetch(`http://localhost:8080/api/content/${contentId}`, {
      method: "PUT", headers: headers(legalToken),
      body: JSON.stringify({
        contentSource: "third_party",
        tbnMediaId: "must be cleared",
        broadcastRightsDuration: null,
        broadcastRightsTerm: "in_perpetuity",
      }),
    });
    assert.equal(updated.status, 200);
    const updatedItem = await updated.json() as { contentSource: string; tbnMediaId: null; broadcastRightsDuration: null; broadcastRightsTerm: string };
    assert.equal(updatedItem.contentSource, "third_party");
    assert.equal(updatedItem.tbnMediaId, null);
    assert.equal(updatedItem.broadcastRightsDuration, null);
    assert.equal(updatedItem.broadcastRightsTerm, "in_perpetuity");
  } finally {
    await pool.query("DELETE FROM contract_content WHERE contract_id = $1", [contractId]).catch(() => {});
    await pool.query("DELETE FROM contracts WHERE id = $1", [contractId]).catch(() => {});
    if (contentId) {
      await pool.query("DELETE FROM audit_logs WHERE entity_type = 'content' AND entity_id = $1", [contentId]).catch(() => {});
      await pool.query("DELETE FROM content_items WHERE id = $1", [contentId]).catch(() => {});
    }
    await pool.query("DELETE FROM content_items WHERE id = $1", [legacyContentId]).catch(() => {});
    await pool.query("DELETE FROM partners WHERE id = $1", [partnerId]).catch(() => {});
    await pool.query("DELETE FROM audit_logs WHERE user_id = ANY($1)", [[legalId, salesId]]).catch(() => {});
    await pool.query("DELETE FROM users WHERE id = ANY($1)", [[legalId, salesId]]).catch(() => {});
    await pool.end();
  }
});