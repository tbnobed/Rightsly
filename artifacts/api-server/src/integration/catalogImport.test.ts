import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import ExcelJS from "exceljs";

const apiRequire = createRequire(new URL("../../package.json", import.meta.url));
const dbRequire = createRequire(new URL("../../../../lib/db/package.json", import.meta.url));
const bcrypt = apiRequire("bcryptjs") as typeof import("bcryptjs");
const { Pool } = dbRequire("pg");

const headers = [
  "Titles", "Internal ID", "Season", "Episode #", "Episode Title",
  "Description", "HD, SD, or Both", "Genre(s)", "Director", "Actors",
  "Year Released", "Release Date", "MPAA or TV Rating:",
];

async function catalogWorkbook(rows: Array<Array<string | number | null>>) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Metadata");
  sheet.addRow(headers);
  rows.forEach((row) => sheet.addRow(row));
  return new Blob([new Uint8Array(await workbook.xlsx.writeBuffer())], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

test("catalog import is authorized, transactional, idempotent, and preserves episodes", async () => {
  const pool = new Pool({ connectionString: process.env["DATABASE_URL"] });
  const suffix = crypto.randomBytes(6).toString("hex");
  const adminId = crypto.randomUUID();
  const salesId = crypto.randomUUID();
  const password = crypto.randomBytes(18).toString("base64url");
  const passwordHash = await bcrypt.hash(password, 10);
  const adminEmail = `catalog-admin-${suffix}@example.invalid`;
  const salesEmail = `catalog-sales-${suffix}@example.invalid`;
  const seriesTitle = `Catalog Series ${suffix}`;
  const filmTitle = `Catalog Film ${suffix}`;
  const rows = [
    [seriesTitle, `EP-${suffix}-1`, 1, "Part 1", "Opening", "Series description", "HD", "Documentary", "Director A", "Actor A", 2025, "2025-01-02", "TV-PG"],
    [null, `EP-${suffix}-2`, 1, 2, "Second", "Second description", "HD", "Documentary", null, "Actor B", 2025, "2025-01-03", "TV-PG"],
    [filmTitle, `FILM-${suffix}`, null, null, null, "Film description", "SD", "Drama", "Director B", "Actor C", 2024, "2024-05-06", "PG"],
  ];

  async function login(email: string) {
    const response = await fetch("http://localhost:8080/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    assert.equal(response.status, 200);
    return (await response.json() as { token: string }).token;
  }

  async function upload(token: string, route: string, sourceRows = rows) {
    const body = new FormData();
    body.append("file", await catalogWorkbook(sourceRows), "catalog.xlsx");
    return fetch(`http://localhost:8080/api/import/catalog${route}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body,
    });
  }

  try {
    await pool.query(
      `INSERT INTO users (id, email, name, role, password_hash, is_active) VALUES
       ($1, $2, 'Catalog Admin', 'admin', $3, true),
       ($4, $5, 'Catalog Sales', 'sales', $3, true)`,
      [adminId, adminEmail, passwordHash, salesId, salesEmail],
    );
    const adminToken = await login(adminEmail);
    const salesToken = await login(salesEmail);

    const denied = await upload(salesToken, "/validate");
    assert.equal(denied.status, 403);

    const preview = await upload(adminToken, "/validate");
    assert.equal(preview.status, 200);
    assert.deepEqual(await preview.json(), {
      total: 3,
      ready: 3,
      duplicates: 0,
      invalid: 0,
      titleCount: 2,
      episodic: 2,
      standalone: 1,
      errors: [],
      warnings: [],
    });

    const imported = await upload(adminToken, "");
    assert.equal(imported.status, 200);
    assert.deepEqual(await imported.json(), {
      imported: 3,
      failed: 0,
      duplicates: 0,
      titlesCreated: 2,
      titlesUpdated: 0,
      episodesCreated: 2,
      episodesUpdated: 0,
      errors: [],
      warnings: [],
    });

    const persisted = await pool.query(`
      SELECT c.title, c.catalog_internal_id, count(e.id)::int AS episode_count
      FROM content_items c
      LEFT JOIN episodes e ON e.content_item_id = c.id
      WHERE c.title = ANY($1)
      GROUP BY c.id, c.title, c.catalog_internal_id
      ORDER BY c.title
    `, [[seriesTitle, filmTitle]]);
    assert.deepEqual(persisted.rows as Array<{
      title: string;
      catalog_internal_id: string | null;
      episode_count: number;
    }>, [
      { title: filmTitle, catalog_internal_id: `FILM-${suffix}`, episode_count: 0 },
      { title: seriesTitle, catalog_internal_id: null, episode_count: 2 },
    ]);

    const seriesId = ((await pool.query(
      "SELECT id FROM content_items WHERE title = $1",
      [seriesTitle],
    )).rows[0] as { id: string }).id;
    const detail = await fetch(`http://localhost:8080/api/content/${seriesId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(detail.status, 200);
    const detailBody = await detail.json() as {
      episodes: Array<{ episodeNumber: number | null; episodeNumberText: string | null; internalId: string | null }>;
    };
    assert.deepEqual(
      detailBody.episodes.map(({ episodeNumber, episodeNumberText, internalId }) => ({
        episodeNumber, episodeNumberText, internalId,
      })).sort((a, b) => (a.internalId ?? "").localeCompare(b.internalId ?? "")),
      [
        { episodeNumber: null, episodeNumberText: "Part 1", internalId: `EP-${suffix}-1` },
        { episodeNumber: 2, episodeNumberText: "2", internalId: `EP-${suffix}-2` },
      ],
    );

    const duplicate = await upload(adminToken, "");
    assert.equal(duplicate.status, 200);
    assert.equal((await duplicate.json() as { imported: number }).imported, 0);

    const protectedDelete = await fetch(`http://localhost:8080/api/content/${seriesId}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ seasons: [] }),
    });
    assert.equal(protectedDelete.status, 409);
    assert.match((await protectedDelete.json() as { message: string }).message, /imported episodes/);

    const renamed = rows.map((row, index) =>
      index === 0 ? [`Renamed ${seriesTitle}`, ...row.slice(1)] : row);
    const collision = await upload(adminToken, "/validate", renamed);
    assert.equal(collision.status, 200);
    const collisionBody = await collision.json() as { invalid: number; errors: Array<{ message: string }> };
    assert.equal(collisionBody.invalid, 2);
    assert.match(collisionBody.errors[0].message, /different catalog title/);
  } finally {
    await pool.query("DELETE FROM audit_logs WHERE user_id = ANY($1)", [[adminId, salesId]]).catch(() => {});
    await pool.query("DELETE FROM content_items WHERE title = ANY($1)", [[seriesTitle, filmTitle]]).catch(() => {});
    await pool.query("DELETE FROM users WHERE id = ANY($1)", [[adminId, salesId]]).catch(() => {});
    await pool.end();
  }
});