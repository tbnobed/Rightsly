import { Router } from "express";
import { db } from "@workspace/db";
import { notificationsTable, contractsTable, partnersTable, revenueReportsTable, royaltyApprovalsTable } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq, and, or, desc, count, lte, gte, lt, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { authenticateToken } from "../lib/auth";
import { sendNotificationEmail } from "../lib/email";
import { logger } from "../lib/logger";
import { canReceiveRevenueNotifications } from "../lib/notificationPolicy";

const router = Router();
router.use(authenticateToken);

const EXPIRY_WINDOW_DAYS = 60;

function isoDate(d: Date) {
  return d.toISOString().split("T")[0];
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
  const [currentUser] = await db
    .select({ role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!currentUser) return;

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
        eq(contractsTable.status, "active"),
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

  if (canReceiveRevenueNotifications(currentUser.role)) {
    // 2. Scheduled revenue reports due within the alert window.
    const expectedReports = await db
    .select({
      id: revenueReportsTable.id,
      contractId: revenueReportsTable.contractId,
      period: revenueReportsTable.period,
      expectedDate: revenueReportsTable.expectedDate,
      partnerName: partnersTable.name,
    })
    .from(revenueReportsTable)
    .innerJoin(contractsTable, eq(contractsTable.id, revenueReportsTable.contractId))
    .leftJoin(partnersTable, eq(partnersTable.id, contractsTable.partnerId))
    .where(
      and(
        or(eq(revenueReportsTable.status, "expected"), eq(revenueReportsTable.status, "overdue")),
        isNotNull(revenueReportsTable.expectedDate),
        lte(revenueReportsTable.expectedDate, isoDate(cutoff)),
        eq(contractsTable.status, "active"),
        eq(contractsTable.archived, false)
      )
    );

    for (const report of expectedReports) {
      const key = `report_expected:${report.id}:${report.expectedDate}`;
      if (existingKeys.has(key)) continue;
      toInsert.push({
        id: crypto.randomUUID(),
        userId,
        type: "report_expected",
        title: `Revenue report expected from ${report.partnerName ?? "partner"}`,
        message: `The ${report.period} report is due ${report.expectedDate}.`,
        link: `/royalties?contractId=${encodeURIComponent(report.contractId)}`,
        dedupeKey: key,
      });
    }
  }

  // 3. Every admin/finance user receives one durable, direct notification per
  // report awaiting review or approval.  The unique user/dedupe index makes
  // this safe when several notification requests arrive concurrently.
  if (canReceiveRevenueNotifications(currentUser.role)) {
    const awaitingApproval = await db
      .select({
        reportId: revenueReportsTable.id,
        contractId: revenueReportsTable.contractId,
        period: revenueReportsTable.period,
        partnerName: partnersTable.name,
      })
      .from(revenueReportsTable)
      .leftJoin(royaltyApprovalsTable, eq(royaltyApprovalsTable.reportId, revenueReportsTable.id))
      .leftJoin(contractsTable, eq(contractsTable.id, revenueReportsTable.contractId))
      .leftJoin(partnersTable, eq(partnersTable.id, contractsTable.partnerId))
      .where(and(
        // Older reports may predate the approval row; they still need review.
        // PostgreSQL's null behavior is handled by the separate query below.
        ne(royaltyApprovalsTable.status, "approved"),
      ));
    const withoutApproval = await db
      .select({
        reportId: revenueReportsTable.id,
        contractId: revenueReportsTable.contractId,
        period: revenueReportsTable.period,
        partnerName: partnersTable.name,
      })
      .from(revenueReportsTable)
      .leftJoin(royaltyApprovalsTable, eq(royaltyApprovalsTable.reportId, revenueReportsTable.id))
      .leftJoin(contractsTable, eq(contractsTable.id, revenueReportsTable.contractId))
      .leftJoin(partnersTable, eq(partnersTable.id, contractsTable.partnerId))
      .where(isNull(royaltyApprovalsTable.id));
    for (const report of [...awaitingApproval, ...withoutApproval]) {
      const key = `approval_needed:${report.reportId}`;
      if (existingKeys.has(key)) continue;
      toInsert.push({
        id: crypto.randomUUID(), userId, type: "approval_needed",
        title: `Revenue report needs approval: ${report.period}`,
        message: `Review the report from ${report.partnerName ?? "partner"} before it is approved.`,
        link: `/royalties?contractId=${encodeURIComponent(report.contractId)}`,
        dedupeKey: key,
      });
    }
  }

  if (toInsert.length) {
    // Unique index on (user_id, dedupe_key) + onConflictDoNothing makes
    // generation safe under concurrent requests
    const inserted = await db
      .insert(notificationsTable)
      .values(toInsert)
      .onConflictDoNothing()
      .returning();

    if (inserted.length) {
      // Fire-and-forget notification emails for newly inserted rows. Never let
      // email failures affect the request; catch and log.
      void (async () => {
        try {
          const [user] = await db
            .select({ email: usersTable.email, name: usersTable.name })
            .from(usersTable)
            .where(eq(usersTable.id, userId));
          if (!user?.email) return;
          for (const n of inserted) {
            await sendNotificationEmail(
              { email: user.email, name: user.name },
              { title: n.title, message: n.message, link: n.link },
            );
          }
        } catch (err) {
          logger.error({ err, userId }, "Failed to send notification emails");
        }
      })();
    }
  }
}

export async function runNotificationSweep() {
  await db.execute(sql`
    DELETE FROM notifications n
    USING users u
    WHERE n.user_id = u.id
      AND u.role NOT IN ('admin', 'finance')
      AND n.type IN ('report_expected', 'approval_needed')
  `);
  await db.execute(sql`
    DELETE FROM notifications n
    USING users u
    WHERE n.user_id = u.id
      AND u.role = 'sales'
      AND n.type = 'contract_expiring'
      AND NOT EXISTS (
        SELECT 1 FROM contracts c
        WHERE n.link = '/contracts/' || c.id
          AND c.status = 'active'
          AND c.archived = false
          AND c.end_type = 'date'
          AND c.end_date >= CURRENT_DATE
      )
  `);
  const today = isoDate(new Date());
  await db
    .update(revenueReportsTable)
    .set({ status: "overdue" })
    .where(and(
      eq(revenueReportsTable.status, "expected"),
      isNotNull(revenueReportsTable.expectedDate),
      lt(revenueReportsTable.expectedDate, today),
    ));
  const users = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.isActive, true));
  for (const user of users) {
    await generateForUser(user.id);
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
