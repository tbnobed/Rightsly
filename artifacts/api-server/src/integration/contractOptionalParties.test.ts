import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";
import { createRequire } from "node:module";

const apiRequire = createRequire(new URL("../../package.json", import.meta.url));
const dbRequire = createRequire(new URL("../../../../lib/db/package.json", import.meta.url));
const bcrypt = apiRequire("bcryptjs") as typeof import("bcryptjs");
const { Pool } = dbRequire("pg");

test("contracts can be created without parties and later cleared", async () => {
  const pool = new Pool({ connectionString: process.env["DATABASE_URL"] });
  const suffix = crypto.randomBytes(6).toString("hex");
  const userId = crypto.randomUUID();
  const email = `contract-optional-parties-${suffix}@example.invalid`;
  const password = crypto.randomBytes(18).toString("base64url");
  let contractId: string | undefined;

  try {
    await pool.query(
      `INSERT INTO users (id, email, name, role, password_hash, is_active)
       VALUES ($1, $2, 'Optional Parties Integration', 'admin', $3, true)`,
      [userId, email, await bcrypt.hash(password, 10)],
    );

    const login = await fetch("http://localhost:8080/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    assert.equal(login.status, 200);
    const token = (await login.json() as { token: string }).token;
    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    const createdResponse = await fetch("http://localhost:8080/api/contracts", {
      method: "POST",
      headers,
      body: JSON.stringify({
        direction: "rights_in",
        endType: "perpetuity",
        status: "draft",
        territories: [],
        distributionTypes: [],
        contentItemIds: [],
        seasonIds: [],
      }),
    });
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json() as {
      id: string;
      partnerId: string | null;
      partnerName: string | null;
      licensor: string | null;
      licensee: string | null;
    };
    contractId = created.id;
    assert.equal(created.partnerId, null);
    assert.equal(created.partnerName, null);
    assert.equal(created.licensor, null);
    assert.equal(created.licensee, null);

    const filledResponse = await fetch(`http://localhost:8080/api/contracts/${contractId}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        licensor: "Later Licensor",
        licensee: "Later Licensee",
      }),
    });
    assert.equal(filledResponse.status, 200);
    const filled = await filledResponse.json() as {
      partnerId: string | null;
      partnerName: string | null;
      licensor: string | null;
      licensee: string | null;
    };
    assert.equal(filled.partnerId, null);
    assert.equal(filled.partnerName, null);
    assert.equal(filled.licensor, "Later Licensor");
    assert.equal(filled.licensee, "Later Licensee");

    const clearedResponse = await fetch(`http://localhost:8080/api/contracts/${contractId}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        partnerId: null,
        licensor: null,
        licensee: null,
      }),
    });
    assert.equal(clearedResponse.status, 200);
    const cleared = await clearedResponse.json() as {
      partnerId: string | null;
      partnerName: string | null;
      licensor: string | null;
      licensee: string | null;
    };
    assert.equal(cleared.partnerId, null);
    assert.equal(cleared.partnerName, null);
    assert.equal(cleared.licensor, null);
    assert.equal(cleared.licensee, null);

    const listedResponse = await fetch(
      "http://localhost:8080/api/contracts?page=1&pageSize=100&sortBy=createdAt&sortDirection=desc",
      { headers: { Authorization: `Bearer ${token}` } },
    );
    assert.equal(listedResponse.status, 200);
    const listed = await listedResponse.json() as {
      data: Array<{ id: string; partnerId: string | null; partnerName: string | null }>;
    };
    const listedContract = listed.data.find((contract) => contract.id === contractId);
    assert.ok(listedContract);
    assert.equal(listedContract.partnerId, null);
    assert.equal(listedContract.partnerName, null);
  } finally {
    await pool.query(
      `DELETE FROM audit_logs WHERE user_id = $1;
       DELETE FROM contracts WHERE id = $2;
       DELETE FROM users WHERE id = $1`,
      [userId, contractId],
    ).catch(() => {});
    await pool.end();
  }
});