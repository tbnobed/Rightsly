import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";
import pg from "pg";

const { Pool } = pg;

test("reconciled schema persists new rights and revenue fields", async () => {
  assert.ok(process.env["DATABASE_URL"], "DATABASE_URL is required");
  const pool = new Pool({ connectionString: process.env["DATABASE_URL"] });
  const client = await pool.connect();
  const id = () => crypto.randomUUID();
  const partnerId = id();
  const contentId = id();
  const seasonId = id();
  const contractId = id();
  const reportId = id();
  const scheduleKey = `schema-upgrade:${id()}`;

  try {
    await client.query("BEGIN");
    await client.query(
      "INSERT INTO partners (id, name, type) VALUES ($1, $2, 'Licensor')",
      [partnerId, "Schema upgrade integration"],
    );
    await client.query(
      "INSERT INTO content_items (id, type, title) VALUES ($1, 'TVSeries', $2)",
      [contentId, "Schema upgrade integration"],
    );
    await client.query(
      "INSERT INTO seasons (id, content_item_id, season_number) VALUES ($1, $2, 1)",
      [seasonId, contentId],
    );
    await client.query(
      `INSERT INTO contracts (
        id, direction, partner_id, status, start_date, end_type, end_date,
        rights_in_social_accounts
      ) VALUES ($1, 'rights_in', $2, 'active', '2026-01-01', 'date', '2027-12-31', $3::json)`,
      [contractId, partnerId, JSON.stringify({ Instagram: "@schema-upgrade" })],
    );
    await client.query(
      "INSERT INTO contract_content (contract_id, content_item_id) VALUES ($1, $2)",
      [contractId, contentId],
    );
    await client.query(
      "INSERT INTO contract_seasons (contract_id, season_id) VALUES ($1, $2)",
      [contractId, seasonId],
    );
    await client.query(
      `INSERT INTO revenue_reports (
        id, contract_id, period, expected_date, amount_received, cost_amount,
        period_start, period_end, schedule_generated, schedule_key
      ) VALUES ($1, $2, 'January 2026', '2026-02-28', 100, 25,
        '2026-01-01', '2026-01-31', true, $3)`,
      [reportId, contractId, scheduleKey],
    );

    const persisted = await client.query<{
      rights_in_social_accounts: Record<string, string>;
      season_count: number;
      schedule_count: number;
    }>(`
      SELECT
        c.rights_in_social_accounts,
        (SELECT count(*)::int FROM contract_seasons cs WHERE cs.contract_id = c.id) AS season_count,
        (SELECT count(*)::int FROM revenue_reports rr
          WHERE rr.contract_id = c.id AND rr.schedule_generated = true
            AND rr.schedule_key IS NOT NULL) AS schedule_count
      FROM contracts c
      WHERE c.id = $1
    `, [contractId]);
    assert.deepEqual(persisted.rows[0]?.rights_in_social_accounts, { Instagram: "@schema-upgrade" });
    assert.equal(persisted.rows[0]?.season_count, 1);
    assert.equal(persisted.rows[0]?.schedule_count, 1);

    await client.query("SAVEPOINT season_delete");
    await assert.rejects(
      client.query("DELETE FROM seasons WHERE id = $1", [seasonId]),
      (error: unknown) => (error as { code?: string }).code === "23503",
    );
    await client.query("ROLLBACK TO SAVEPOINT season_delete");

    await client.query("SAVEPOINT title_delete");
    await assert.rejects(
      client.query("DELETE FROM content_items WHERE id = $1", [contentId]),
      (error: unknown) => (error as { code?: string }).code === "23503",
    );
    await client.query("ROLLBACK TO SAVEPOINT title_delete");
  } finally {
    await client.query("ROLLBACK");
    client.release();
    await pool.end();
  }
});