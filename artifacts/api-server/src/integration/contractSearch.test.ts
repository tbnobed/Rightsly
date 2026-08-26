import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";
import { createRequire } from "node:module";

const apiRequire = createRequire(new URL("../../package.json", import.meta.url));
const dbRequire = createRequire(new URL("../../../../lib/db/package.json", import.meta.url));
const bcrypt = apiRequire("bcryptjs") as typeof import("bcryptjs");
const { Pool } = dbRequire("pg");

test("general contract search matches canonical and legacy territory aliases", async () => {
  const pool = new Pool({ connectionString: process.env["DATABASE_URL"] });
  const suffix = crypto.randomBytes(6).toString("hex");
  const userId = crypto.randomUUID();
  const partnerId = crypto.randomUUID();
  const amazonContractId = crypto.randomUUID();
  const unrelatedContractId = crypto.randomUUID();
  const email = `contract-search-${suffix}@example.invalid`;
  const password = crypto.randomBytes(18).toString("base64url");

  try {
    await pool.query(
      `INSERT INTO users (id, email, name, role, password_hash, is_active)
       VALUES ($1, $2, 'Contract Search Integration', 'admin', $3, true)`,
      [userId, email, await bcrypt.hash(password, 10)],
    );
    await pool.query(
      `INSERT INTO partners (id, name, type) VALUES ($1, $2, 'Licensee')`,
      [partnerId, `Search fixture partner ${suffix}`],
    );
    await pool.query(
      `INSERT INTO contracts
         (id, direction, partner_id, licensor, licensee, status, end_type, territories, created_by)
       VALUES
         ($1, 'rights_out', $3, 'TBN', 'Amazon Prime Video', 'active', 'perpetuity', '["US"]'::json, $4),
         ($2, 'rights_out', $3, 'Unrelated Licensor', 'Other Platform', 'active', 'perpetuity', '["Canada"]'::json, $4)`,
      [amazonContractId, unrelatedContractId, partnerId, userId],
    );

    const login = await fetch("http://localhost:8080/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    assert.equal(login.status, 200);
    const token = (await login.json() as { token: string }).token;

    for (const search of ["United States", "US", "USA", "U.S."]) {
      const response = await fetch(
        `http://localhost:8080/api/contracts?search=${encodeURIComponent(search)}&sortBy=createdAt&sortDirection=desc&page=1&pageSize=100`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      assert.equal(response.status, 200);
      const result = await response.json() as { data: { id: string }[] };
      const ids = result.data.map((contract) => contract.id);
      assert.ok(ids.includes(amazonContractId), `${search} should match the legacy US contract`);
      assert.ok(!ids.includes(unrelatedContractId), `${search} should not match the Canada contract`);
    }
  } finally {
    await pool.query(`
      DELETE FROM audit_logs WHERE user_id = $1;
      DELETE FROM contracts WHERE id = ANY($2);
      DELETE FROM partners WHERE id = $3;
      DELETE FROM notifications WHERE user_id = $1;
      DELETE FROM users WHERE id = $1;
    `, [userId, [amazonContractId, unrelatedContractId], partnerId]).catch(() => {});
    await pool.end();
  }
});