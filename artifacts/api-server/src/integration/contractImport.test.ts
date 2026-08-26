import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";
import { createRequire } from "node:module";

const apiRequire = createRequire(new URL("../../package.json", import.meta.url));
const dbRequire = createRequire(new URL("../../../../lib/db/package.json", import.meta.url));
const bcrypt = apiRequire("bcryptjs") as typeof import("bcryptjs");
const { Pool } = dbRequire("pg");

test("CSV import rolls back a failed row without undoing valid rows", async () => {
  const pool = new Pool({ connectionString: process.env["DATABASE_URL"] });
  const suffix = crypto.randomBytes(6).toString("hex");
  const userId = crypto.randomUUID();
  const email = `import-${suffix}@example.invalid`;
  const password = crypto.randomBytes(18).toString("base64url");
  const validPartner = `Import valid ${suffix}`;
  const failedPartner = `Import rollback ${suffix}`;

  try {
    await pool.query(
      `INSERT INTO users (id, email, name, role, password_hash, is_active)
       VALUES ($1, $2, 'Import Integration', 'admin', $3, true)`,
      [userId, email, await bcrypt.hash(password, 10)],
    );
    const login = await fetch("http://localhost:8080/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    assert.equal(login.status, 200);
    const token = (await login.json() as { token: string }).token;

    const source = [
      "direction,partner_name,end_type,notes",
      `rights_in,${validPartner},perpetuity,`,
      `rights_out,${failedPartner},perpetuity,\0`,
    ].join("\n");
    const body = new FormData();
    body.append("file", new Blob([source], { type: "text/csv" }), "rightsline.csv");
    const response = await fetch("http://localhost:8080/api/import/contracts", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body,
    });
    assert.equal(response.status, 200);
    const result = await response.json() as {
      imported: number;
      failed: number;
      createdPartners: number;
      errors: { row: number; message: string }[];
    };
    assert.equal(result.imported, 1);
    assert.equal(result.failed, 1);
    assert.equal(result.createdPartners, 1);
    assert.deepEqual(result.errors.map((error) => error.row), [3]);

    const partners = await pool.query(`
      SELECT p.name, count(c.id)::int AS contract_count
      FROM partners p
      LEFT JOIN contracts c ON c.partner_id = p.id
      WHERE p.name = ANY($1)
      GROUP BY p.id, p.name
    `, [[validPartner, failedPartner]]);
    assert.deepEqual(
      partners.rows as { name: string; contract_count: number }[],
      [{ name: validPartner, contract_count: 1 }],
    );
  } finally {
    await pool.query(`
      DELETE FROM audit_logs WHERE user_id = $1;
      DELETE FROM contracts WHERE partner_id IN (
        SELECT id FROM partners WHERE name = ANY($2)
      );
      DELETE FROM partners WHERE name = ANY($2);
      DELETE FROM notifications WHERE user_id = $1;
      DELETE FROM users WHERE id = $1;
    `, [userId, [validPartner, failedPartner]]).catch(() => {});
    await pool.end();
  }
});

test("Legal cannot import financial fields while Admin can", async () => {
  const pool = new Pool({ connectionString: process.env["DATABASE_URL"] });
  const suffix = crypto.randomBytes(6).toString("hex");
  const password = crypto.randomBytes(18).toString("base64url");
  const passwordHash = await bcrypt.hash(password, 10);
  const users = {
    admin: { id: crypto.randomUUID(), email: `import-admin-${suffix}@example.invalid` },
    legal: { id: crypto.randomUUID(), email: `import-legal-${suffix}@example.invalid` },
  };
  const partnerName = `Import financial ${suffix}`;
  const tokens: Record<string, string> = {};

  async function login(role: "admin" | "legal") {
    const response = await fetch("http://localhost:8080/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: users[role].email, password }),
    });
    assert.equal(response.status, 200);
    tokens[role] = (await response.json() as { token: string }).token;
  }

  async function upload(role: "admin" | "legal") {
    const source = [
      "direction,partner_name,end_type,royalty_type,royalty_details,payment_terms",
      `rights_out,${partnerName},perpetuity,revenue_share,70/30,net_30`,
    ].join("\n");
    const body = new FormData();
    body.append("file", new Blob([source], { type: "text/csv" }), "rightsline-financial.csv");
    return fetch("http://localhost:8080/api/import/contracts", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokens[role]}` },
      body,
    });
  }

  try {
    for (const role of ["admin", "legal"] as const) {
      await pool.query(
        `INSERT INTO users (id, email, name, role, password_hash, is_active)
         VALUES ($1, $2, $3, $4, $5, true)`,
        [users[role].id, users[role].email, `Import ${role}`, role, passwordHash],
      );
      await login(role);
    }

    const legal = await upload("legal");
    assert.equal(legal.status, 403);
    assert.equal(
      Number((await pool.query("SELECT count(*) FROM partners WHERE name = $1", [partnerName])).rows[0].count),
      0,
    );

    const admin = await upload("admin");
    assert.equal(admin.status, 200);
    const result = await admin.json() as { imported: number; failed: number };
    assert.deepEqual(result, {
      imported: 1,
      failed: 0,
      skipped: 0,
      review: 0,
      duplicates: 0,
      errors: [],
      warnings: [],
      createdPartners: 1,
      linkedContent: 0,
      linkedSeasons: 0,
    });
    const financial = await pool.query(`
      SELECT c.royalty_type, c.royalty_details, c.payment_terms
      FROM contracts c
      JOIN partners p ON p.id = c.partner_id
      WHERE p.name = $1
    `, [partnerName]);
    assert.deepEqual(financial.rows, [{
      royalty_type: "revenue_share",
      royalty_details: "70/30",
      payment_terms: "net_30",
    }]);
  } finally {
    const userIds = Object.values(users).map((user) => user.id);
    await pool.query(`
      DELETE FROM audit_logs WHERE user_id = ANY($1);
      DELETE FROM contracts WHERE partner_id IN (
        SELECT id FROM partners WHERE name = $2
      );
      DELETE FROM partners WHERE name = $2;
      DELETE FROM notifications WHERE user_id = ANY($1);
      DELETE FROM users WHERE id = ANY($1);
    `, [userIds, partnerName]).catch(() => {});
    await pool.end();
  }
});

test("expanded import validates first, links exact content, and skips source-key duplicates", async () => {
  const pool = new Pool({ connectionString: process.env["DATABASE_URL"] });
  const suffix = crypto.randomBytes(6).toString("hex");
  const userId = crypto.randomUUID();
  const contentId = crypto.randomUUID();
  const seasonId = crypto.randomUUID();
  const email = `import-expanded-${suffix}@example.invalid`;
  const password = crypto.randomBytes(18).toString("base64url");
  const partnerName = `Expanded partner ${suffix}`;
  const contentTitle = `Expanded title ${suffix}`;
  const sourceKey = `expanded:${suffix}`;

  async function upload(token: string, route: string) {
    const source = [
      "direction,partner_name,end_type,source_key,import_action,content_titles,content_seasons,document_url,source_sheet,source_row,raw_source_data",
      `rights_out,${partnerName},perpetuity,${sourceKey},import,${contentTitle},${contentTitle}::1,https://example.com/agreement.pdf,Expanded Sheet,7,\"{\"\"legacy\"\":true}\"`,
      ",,,,review,,,,,,",
      ",,,,skip,,,,,,",
    ].join("\n");
    const body = new FormData();
    body.append("file", new Blob([source], { type: "text/csv" }), "expanded.csv");
    return fetch(`http://localhost:8080/api/import/contracts${route}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body,
    });
  }

  try {
    await pool.query(
      `INSERT INTO users (id, email, name, role, password_hash, is_active)
       VALUES ($1, $2, 'Expanded Import', 'admin', $3, true)`,
      [userId, email, await bcrypt.hash(password, 10)],
    );
    await pool.query(
      "INSERT INTO content_items (id, type, title) VALUES ($1, 'TVSeries', $2)",
      [contentId, contentTitle],
    );
    await pool.query(
      "INSERT INTO seasons (id, content_item_id, season_number) VALUES ($1, $2, 1)",
      [seasonId, contentId],
    );
    const login = await fetch("http://localhost:8080/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const token = (await login.json() as { token: string }).token;

    const validation = await upload(token, "/validate");
    assert.equal(validation.status, 200);
    assert.deepEqual(await validation.json(), {
      total: 3,
      ready: 1,
      review: 1,
      skipped: 1,
      invalid: 0,
      errors: [],
      warnings: [
        { row: 3, message: "This row requires review before it can be imported" },
      ],
    });
    assert.equal(
      Number((await pool.query("SELECT count(*) FROM partners WHERE name = $1", [partnerName])).rows[0].count),
      0,
    );

    const first = await upload(token, "");
    assert.equal(first.status, 200);
    const firstResult = await first.json() as {
      imported: number;
      review: number;
      skipped: number;
      linkedContent: number;
      linkedSeasons: number;
    };
    assert.equal(firstResult.imported, 1);
    assert.equal(firstResult.review, 1);
    assert.equal(firstResult.skipped, 1);
    assert.equal(firstResult.linkedContent, 1);
    assert.equal(firstResult.linkedSeasons, 1);

    const duplicateValidation = await upload(token, "/validate");
    assert.equal(duplicateValidation.status, 200);
    const duplicatePreview = await duplicateValidation.json() as {
      ready: number;
      skipped: number;
      warnings: Array<{ message: string }>;
    };
    assert.equal(duplicatePreview.ready, 0);
    assert.equal(duplicatePreview.skipped, 2);
    assert.ok(duplicatePreview.warnings.some(({ message }) => message.includes("duplicate source_key")));

    const second = await upload(token, "");
    assert.equal(second.status, 200);
    const secondResult = await second.json() as {
      imported: number;
      duplicates: number;
      skipped: number;
    };
    assert.equal(secondResult.imported, 0);
    assert.equal(secondResult.duplicates, 1);
    assert.equal(secondResult.skipped, 2);

    const imported = await pool.query(`
      SELECT c.document_url, c.import_source_sheet, c.import_source_row, c.import_raw_data,
        (SELECT count(*)::int FROM contract_content cc WHERE cc.contract_id = c.id) AS content_count,
        (SELECT count(*)::int FROM contract_seasons cs WHERE cs.contract_id = c.id) AS season_count
      FROM contracts c
      JOIN partners p ON p.id = c.partner_id
      WHERE p.name = $1
    `, [partnerName]);
    assert.deepEqual(imported.rows, [{
      document_url: "https://example.com/agreement.pdf",
      import_source_sheet: "Expanded Sheet",
      import_source_row: 7,
      import_raw_data: "{\"legacy\":true}",
      content_count: 1,
      season_count: 1,
    }]);
  } finally {
    await pool.query("DELETE FROM audit_logs WHERE user_id = $1", [userId]).catch(() => {});
    await pool.query(
      `DELETE FROM contract_content WHERE contract_id IN (
        SELECT c.id FROM contracts c JOIN partners p ON p.id = c.partner_id WHERE p.name = $1
      )`,
      [partnerName],
    ).catch(() => {});
    await pool.query(
      `DELETE FROM contract_seasons WHERE contract_id IN (
        SELECT c.id FROM contracts c JOIN partners p ON p.id = c.partner_id WHERE p.name = $1
      )`,
      [partnerName],
    ).catch(() => {});
    await pool.query(
      "DELETE FROM contracts WHERE partner_id IN (SELECT id FROM partners WHERE name = $1)",
      [partnerName],
    ).catch(() => {});
    await pool.query("DELETE FROM partners WHERE name = $1", [partnerName]).catch(() => {});
    await pool.query("DELETE FROM seasons WHERE content_item_id = $1", [contentId]).catch(() => {});
    await pool.query("DELETE FROM content_items WHERE id = $1", [contentId]).catch(() => {});
    await pool.query("DELETE FROM notifications WHERE user_id = $1", [userId]).catch(() => {});
    await pool.query("DELETE FROM users WHERE id = $1", [userId]).catch(() => {});
    await pool.end();
  }
});