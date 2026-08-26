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
    assert.deepEqual(result, { imported: 1, failed: 0, errors: [], createdPartners: 1 });
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