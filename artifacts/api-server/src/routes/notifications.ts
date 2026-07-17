import { Router } from "express";
import { db } from "@workspace/db";
import { notificationsTable, contractsTable, partnersTable } from "@workspace/db";
import { eq, and, desc, count, lte, gte, lt, isNotNull } from "drizzle-orm";
import { authenticateToken } from "../lib/auth";

const router = Router();
router.use(authenticateToken);

const EXPIRY_WINDOW_DAYS = 60;

function isoDate(d: Date) {
  return d.toISOString().split("T")[0];
}

function currentPeriodKey(frequency: string, now: Date): string {
  const y = now.getFullYear();
  if (frequency === "monthly") return `${y}-M${now.getMonth() + 1}`;
  if (frequency === "quarterly") return `${y}-Q${Math.floor(now.getMonth() / 3) + 1}`;
  return `${y}`;
}

// Generate notifications for the current user (idempotent via dedupeKey)
async function generateForUser(userId: string) {
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() + EXPIRY_WINDOW_DAYS);

  // Retention: hard-delete dismissed/read generated rows older than 90 days
  const retentionCutoff = new Date(now);
  retentionCutoff.setDate(retentionCutoff.getDate() - 90);
  await db
    .delete(notificationsTable)
    .where(
      and(
        eq(notificationsTable.userId, userId),
        eq(notificationsTable.dismissed, true),
        isNotNull(notificationsTable.dedupeKey),
        lt(notificationsTable.createdAt, retentionCutoff)
      )
    );

  const existing = await db
    .select({ dedupeKey: notificationsTable.dedupeKey })
    .from(notificationsTable)
    .where(and(eq(notificationsTable.userId, userId), isNotNull(notificationsTable.dedupeKey)));
  const existingKeys = new Set(existing.map((e) => e.dedupeKey).filter(Boolean));

  const toInsert: (typeof notificationsTable.$inferInsert)[] = [];

  // 1. Contracts expiring within 60 days
  const expiring = await db
    .select({
      id: contractsTable.id,
      endDate: contractsTable.endDate,
      partnerName: partnersTable.name,
    })
    .from(contractsTable)
    .leftJoin(partnersTable, eq(contractsTable.partnerId, partnersTable.id))
    .where(
      and(
        eq(contractsTable.endType, "date"),
        eq(contractsTable.archived, false),
        gte(contractsTable.endDate, isoDate(now)),
        lte(contractsTable.endDate, isoDate(cutoff))
      )
    );

  for (const c of expiring) {
    const key = `contract_expiring:${c.id}:${c.endDate}`;
    if (existingKeys.has(key)) continue;
    toInsert.push({
      id: crypto.randomUUID(),
      userId,
      type: "contract_expiring",
      title: `Contract with ${c.partnerName ?? "partner"} expires ${c.endDate}`,
      message: `This contract ends within ${EXPIRY_WINDOW_DAYS} days. Review for renewal or termination.`,
      link: `/contracts/${c.id}`,
      dedupeKey: key,
    });
  }

  // 2. Revenue reports expected this period (rights out with reporting frequency)
  const reporting = await db
    .select({
      id: contractsTable.id,
      frequency: contractsTable.rightsOutReportingFrequency,
      partnerName: partnersTable.name,
    })
    .from(contractsTable)
    .leftJoin(partnersTable, eq(contractsTable.partnerId, partnersTable.id))
    .where(
      and(
        eq(contractsTable.direction, "rights_out"),
        eq(contractsTable.status, "active"),
        eq(contractsTable.archived, false)
      )
    );

  for (const c of reporting) {
    if (!c.frequency) continue;
    const period = currentPeriodKey(c.frequency, now);
    const key = `report_expected:${c.id}:${period}`;
    if (existingKeys.has(key)) continue;
    toInsert.push({
      id: crypto.randomUUID(),
      userId,
      type: "report_expected",
      title: `Revenue report expected from ${c.partnerName ?? "partner"}`,
      message: `A ${c.frequency} revenue report is expected for the current period.`,
      link: `/contracts/${c.id}`,
      dedupeKey: key,
    });
  }

  if (toInsert.length) {
    // Unique index on (user_id, dedupe_key) + onConflictDoNothing makes
    // generation safe under concurrent requests
    await db.insert(notificationsTable).values(toInsert).onConflictDoNothing();
  }
}

// GET /api/notifications
router.get("/", async (req, res) => {
  await generateForUser(req.user!.id);

  const unreadOnly = req.query.unreadOnly === "true";
  const conditions = [
    eq(notificationsTable.userId, req.user!.id),
    eq(notificationsTable.dismissed, false),
  ];
  if (unreadOnly) conditions.push(eq(notificationsTable.read, false));

  const [data, [{ value: unreadCount }]] = await Promise.all([
    db
      .select()
      .from(notificationsTable)
      .where(and(...conditions))
      .orderBy(desc(notificationsTable.createdAt))
      .limit(50),
    db
      .select({ value: count() })
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.userId, req.user!.id),
          eq(notificationsTable.read, false),
          eq(notificationsTable.dismissed, false)
        )
      ),
  ]);

  res.json({ data, unreadCount: Number(unreadCount) });
});

// POST /api/notifications/:id/read
router.post("/:id/read", async (req, res) => {
  await db
    .update(notificationsTable)
    .set({ read: true })
    .where(and(eq(notificationsTable.id, req.params.id as string), eq(notificationsTable.userId, req.user!.id)));
  res.status(204).end();
});

// POST /api/notifications/read-all
router.post("/read-all", async (req, res) => {
  await db
    .update(notificationsTable)
    .set({ read: true })
    .where(eq(notificationsTable.userId, req.user!.id));
  res.status(204).end();
});

// POST /api/notifications/clear
router.post("/clear", async (req, res) => {
  // Soft-dismiss so dedupeKey prevents immediate regeneration
  await db
    .update(notificationsTable)
    .set({ dismissed: true, read: true })
    .where(eq(notificationsTable.userId, req.user!.id));
  res.status(204).end();
});

export default router;
