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
  const episodeId = id();
  const contractId = id();
  const reportId = id();
  const contactId = id();
  const scheduleKey = `schema-upgrade:${id()}`;

  try {
    await client.query("BEGIN");
    await client.query(
      "INSERT INTO partners (id, name, type) VALUES ($1, $2, 'Licensor')",
      [partnerId, "Schema upgrade integration"],
    );
    await client.query(
      `INSERT INTO content_items (
        id, type, title, content_source, tbn_media_id, notes,
        broadcast_rights_duration, broadcast_rights_term,
        digital_rights_term, international_rights_duration, international_rights_term,
        international_broadcast_air_amount, youtube_rights_duration, youtube_rights_term,
        youtube_rights_custom_term
      ) VALUES ($1, 'TVSeries', $2, 'tbn', 'TBN-123', 'Title notes',
        6, 'months', 'in_perpetuity', 3, 'years', 4, 1, NULL, 'Weeks')`,
      [contentId, "Schema upgrade integration"],
    );
    await client.query(
      "INSERT INTO seasons (id, content_item_id, season_number) VALUES ($1, $2, 1)",
      [seasonId, contentId],
    );
    await client.query(
      `INSERT INTO episodes (
        id, content_item_id, season_id, catalog_key, internal_id,
        episode_number, episode_number_text, title, media_format, genres,
        year, release_date, content_rating, source_row
      ) VALUES ($1, $2, $3, $4, $5, 1, 'Part 1', 'Catalog episode',
        'HD', 'Documentary | Faith Based', 2026, '2026-01-15', 'TV-PG', 2)`,
      [episodeId, contentId, seasonId, `schema-episode:${id()}`, `episode-${id()}`],
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
    await client.query(
      "INSERT INTO contacts (id, name, company, email) VALUES ($1, $2, $3, $4)",
      [contactId, "Schema Contact", "Rightsly", "schema.contact@example.com"],
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

    const contact = await client.query<{ name: string; company: string | null; created_at: Date; updated_at: Date }>(
      "SELECT name, company, created_at, updated_at FROM contacts WHERE id = $1",
      [contactId],
    );
    assert.equal(contact.rows[0]?.name, "Schema Contact");
    assert.equal(contact.rows[0]?.company, "Rightsly");
    assert.ok(contact.rows[0]?.created_at);
    assert.ok(contact.rows[0]?.updated_at);
    const indexes = await client.query<{ indexname: string }>(
      "SELECT indexname FROM pg_indexes WHERE tablename = 'contacts'",
    );
    assert.ok(indexes.rows.some(({ indexname }) => indexname === "contacts_name_idx"));
    assert.ok(indexes.rows.some(({ indexname }) => indexname === "contacts_company_idx"));
    assert.ok(indexes.rows.some(({ indexname }) => indexname === "contacts_import_source_key_idx"));
    const titleRights = await client.query<{
      content_source: string; tbn_media_id: string; broadcast_rights_duration: number;
      digital_rights_term: string; international_broadcast_air_amount: number;
      youtube_rights_custom_term: string;
    }>(
      `SELECT content_source, tbn_media_id, broadcast_rights_duration,
        digital_rights_term, international_broadcast_air_amount, youtube_rights_custom_term
       FROM content_items WHERE id = $1`,
      [contentId],
    );
    assert.equal(titleRights.rows[0]?.content_source, "tbn");
    assert.equal(titleRights.rows[0]?.tbn_media_id, "TBN-123");
    assert.equal(titleRights.rows[0]?.broadcast_rights_duration, 6);
    assert.equal(titleRights.rows[0]?.digital_rights_term, "in_perpetuity");
    assert.equal(titleRights.rows[0]?.international_broadcast_air_amount, 4);
    assert.equal(titleRights.rows[0]?.youtube_rights_custom_term, "Weeks");
    const episode = await client.query<{
      episode_number: number;
      episode_number_text: string;
      media_format: string;
      release_date: string;
    }>(
      `SELECT episode_number, episode_number_text, media_format, release_date::text
       FROM episodes WHERE id = $1`,
      [episodeId],
    );
    assert.equal(episode.rows[0]?.episode_number, 1);
    assert.equal(episode.rows[0]?.episode_number_text, "Part 1");
    assert.equal(episode.rows[0]?.media_format, "HD");
    assert.equal(episode.rows[0]?.release_date, "2026-01-15");

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