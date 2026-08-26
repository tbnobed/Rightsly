import pg from "pg";

const { Pool } = pg;
if (!process.env["DATABASE_URL"]) {
  throw new Error("DATABASE_URL is required");
}

const pool = new Pool({ connectionString: process.env["DATABASE_URL"] });
const findings: { check: string; count: number }[] = [];

async function count(check: string, sql: string) {
  const result = await pool.query<{ count: number }>(sql);
  const value = Number(result.rows[0]?.count ?? 0);
  findings.push({ check, count: value });
}

try {
  const metadata = await pool.query<{
    table_name: string;
    column_name: string | null;
  }>(`
    SELECT t.table_name, c.column_name
    FROM information_schema.tables t
    LEFT JOIN information_schema.columns c
      ON c.table_schema = t.table_schema
      AND c.table_name = t.table_name
    WHERE t.table_schema = 'public'
  `);
  const tables = new Set(metadata.rows.map((row) => row.table_name));
  const columns = new Set(metadata.rows.map((row) => `${row.table_name}.${row.column_name}`));

  if (tables.has("contract_content") && tables.has("content_items")) {
    await count("orphan contract_content rows", `
      SELECT count(*)::int AS count
      FROM contract_content cc
      WHERE NOT EXISTS (
        SELECT 1 FROM content_items ci WHERE ci.id = cc.content_item_id
      )
    `);
  }
  if (tables.has("contract_seasons") && tables.has("seasons")) {
    await count("orphan contract_seasons rows", `
      SELECT count(*)::int AS count
      FROM contract_seasons cs
      WHERE NOT EXISTS (SELECT 1 FROM seasons s WHERE s.id = cs.season_id)
    `);
  }
  if (columns.has("revenue_reports.schedule_key")) {
    await count("duplicate revenue schedule keys", `
      SELECT count(*)::int AS count FROM (
        SELECT schedule_key
        FROM revenue_reports
        WHERE schedule_key IS NOT NULL
        GROUP BY schedule_key
        HAVING count(*) > 1
      ) duplicates
    `);
  }
  if (tables.has("royalty_approvals")) {
    await count("duplicate approval rows per report", `
      SELECT count(*)::int AS count FROM (
        SELECT report_id
        FROM royalty_approvals
        GROUP BY report_id
        HAVING count(*) > 1
      ) duplicates
    `);
  }
  if (columns.has("notifications.dedupe_key")) {
    await count("duplicate notification dedupe keys", `
      SELECT count(*)::int AS count FROM (
        SELECT user_id, dedupe_key
        FROM notifications
        WHERE dedupe_key IS NOT NULL
        GROUP BY user_id, dedupe_key
        HAVING count(*) > 1
      ) duplicates
    `);
  }

  const failed = findings.filter((finding) => finding.count > 0);
  console.log(JSON.stringify({ ok: failed.length === 0, findings }, null, 2));
  if (failed.length) process.exitCode = 1;
} finally {
  await pool.end();
}