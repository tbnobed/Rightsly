import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";
import { createRequire } from "node:module";

const apiRequire = createRequire(new URL("../../package.json", import.meta.url));
const dbRequire = createRequire(new URL("../../../../lib/db/package.json", import.meta.url));
const bcrypt = apiRequire("bcryptjs") as typeof import("bcryptjs");
const { Pool } = dbRequire("pg");

test("contacts enforce roles and partner deletion rejects every linked contract", async () => {
  const pool = new Pool({ connectionString: process.env["DATABASE_URL"] });
  const suffix = crypto.randomBytes(6).toString("hex");
  const adminId = crypto.randomUUID();
  const legalId = crypto.randomUUID();
  const financeId = crypto.randomUUID();
  const salesId = crypto.randomUUID();
  const linkedPartnerId = crypto.randomUUID();
  const unlinkedPartnerId = crypto.randomUUID();
  const contractId = crypto.randomUUID();
  const contactIds: string[] = [];
  const password = crypto.randomBytes(18).toString("base64url");
  const adminEmail = `contacts-admin-${suffix}@example.invalid`;
  const legalEmail = `contacts-legal-${suffix}@example.invalid`;
  const financeEmail = `contacts-finance-${suffix}@example.invalid`;
  const salesEmail = `contacts-sales-${suffix}@example.invalid`;

  const login = async (email: string): Promise<string> => {
    const response = await fetch("http://localhost:8080/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    assert.equal(response.status, 200);
    return (await response.json() as { token: string }).token;
  };

  try {
    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      `INSERT INTO users (id, email, name, role, password_hash, is_active) VALUES
       ($1, $2, 'Contacts Admin', 'admin', $3, true),
       ($4, $5, 'Contacts Legal', 'legal', $3, true),
       ($6, $7, 'Contacts Finance', 'finance', $3, true),
       ($8, $9, 'Contacts Sales', 'sales', $3, true)`,
      [adminId, adminEmail, hash, legalId, legalEmail, financeId, financeEmail, salesId, salesEmail],
    );
    await pool.query(
      "INSERT INTO partners (id, name, type) VALUES ($1, $2, 'Licensor'), ($3, $4, 'Licensor')",
      [linkedPartnerId, `Linked ${suffix}`, unlinkedPartnerId, `Unlinked ${suffix}`],
    );
    // Archived and expired contracts must still block deletion.
    await pool.query(
      `INSERT INTO contracts (id, direction, partner_id, status, end_type, archived)
       VALUES ($1, 'rights_in', $2, 'expired', 'date', true)`,
      [contractId, linkedPartnerId],
    );
    const adminToken = await login(adminEmail);
    const legalToken = await login(legalEmail);
    const financeToken = await login(financeEmail);
    const salesToken = await login(salesEmail);
    const headers = (token: string) => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" });

    const missing = await fetch(`http://localhost:8080/api/partners/${crypto.randomUUID()}`, {
      method: "DELETE", headers: headers(adminToken),
    });
    assert.equal(missing.status, 404);
    const linked = await fetch(`http://localhost:8080/api/partners/${linkedPartnerId}`, {
      method: "DELETE", headers: headers(adminToken),
    });
    assert.equal(linked.status, 409);
    const unlinked = await fetch(`http://localhost:8080/api/partners/${unlinkedPartnerId}`, {
      method: "DELETE", headers: headers(adminToken),
    });
    assert.equal(unlinked.status, 200);

    const deniedCreate = await fetch("http://localhost:8080/api/contacts", {
      method: "POST", headers: headers(salesToken), body: JSON.stringify({ name: "Denied" }),
    });
    assert.equal(deniedCreate.status, 403);
    const created = await fetch("http://localhost:8080/api/contacts", {
      method: "POST", headers: headers(adminToken),
      body: JSON.stringify({ name: `  Ada ${suffix}  `, company: "  Example Co  ", email: "ada@example.com" }),
    });
    assert.equal(created.status, 201);
    const contact = await created.json() as { id: string; name: string; company: string | null };
    contactIds.push(contact.id);
    assert.equal(contact.name, `Ada ${suffix}`);
    assert.equal(contact.company, "Example Co");

    const legalCreated = await fetch("http://localhost:8080/api/contacts", {
      method: "POST", headers: headers(legalToken),
      body: JSON.stringify({ name: `Legal ${suffix}`, company: "Counsel Co" }),
    });
    assert.equal(legalCreated.status, 201);
    const legalContact = await legalCreated.json() as { id: string };
    contactIds.push(legalContact.id);

    const list = await fetch(`http://localhost:8080/api/contacts?search=${encodeURIComponent(suffix)}`, {
      headers: headers(salesToken),
    });
    assert.equal(list.status, 200);
    assert.ok((await list.json() as { data: { id: string }[] }).data.some(({ id }) => id === contact.id));
    const updated = await fetch(`http://localhost:8080/api/contacts/${contact.id}`, {
      method: "PATCH", headers: headers(adminToken),
      body: JSON.stringify({ title: " Counsel ", company: " " }),
    });
    assert.equal(updated.status, 200);
    assert.equal((await updated.json() as { company: string | null; title: string | null }).company, null);
    const legalUpdated = await fetch(`http://localhost:8080/api/contacts/${legalContact.id}`, {
      method: "PATCH", headers: headers(legalToken),
      body: JSON.stringify({ title: "Outside Counsel" }),
    });
    assert.equal(legalUpdated.status, 200);
    const salesUpdate = await fetch(`http://localhost:8080/api/contacts/${contact.id}`, {
      method: "PATCH", headers: headers(salesToken),
      body: JSON.stringify({ title: "Denied" }),
    });
    assert.equal(salesUpdate.status, 403);
    const financeDelete = await fetch(`http://localhost:8080/api/contacts/${contact.id}`, {
      method: "DELETE", headers: headers(financeToken),
    });
    assert.equal(financeDelete.status, 403);
    const legalDelete = await fetch(`http://localhost:8080/api/contacts/${legalContact.id}`, {
      method: "DELETE", headers: headers(legalToken),
    });
    assert.equal(legalDelete.status, 403);
    const deleted = await fetch(`http://localhost:8080/api/contacts/${contact.id}`, {
      method: "DELETE", headers: headers(adminToken),
    });
    assert.equal(deleted.status, 200);
    contactIds.splice(contactIds.indexOf(contact.id), 1);
    const audit = await pool.query(
      `SELECT action FROM audit_logs WHERE entity_type = 'contact' AND entity_id = $1 ORDER BY action`,
      [contact.id],
    );
    assert.deepEqual(audit.rows.map(({ action }: { action: string }) => action), ["create", "update", "delete"]);
    const legalContactDeleted = await fetch(`http://localhost:8080/api/contacts/${legalContact.id}`, {
      method: "DELETE", headers: headers(adminToken),
    });
    assert.equal(legalContactDeleted.status, 200);
    contactIds.splice(contactIds.indexOf(legalContact.id), 1);
  } finally {
    await pool.query(`
      DELETE FROM audit_logs WHERE user_id = ANY($1);
      DELETE FROM contacts WHERE id = ANY($2);
      DELETE FROM contracts WHERE id = $3;
      DELETE FROM partners WHERE id = ANY($4);
      DELETE FROM notifications WHERE user_id = ANY($1);
      DELETE FROM users WHERE id = ANY($1);
    `, [[adminId, legalId, financeId, salesId], contactIds, contractId, [linkedPartnerId, unlinkedPartnerId]]).catch(() => {});
    await pool.end();
  }
});