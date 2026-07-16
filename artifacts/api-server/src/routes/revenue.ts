import { Router } from "express";
import { db } from "@workspace/db";
import { revenueReportsTable, contractsTable, partnersTable } from "@workspace/db";
import { eq, and, count, sql, desc } from "drizzle-orm";
import { authenticateToken, requireRole } from "../lib/auth";
import { logAudit } from "../lib/audit";

const router = Router();
router.use(authenticateToken);

// GET /api/contracts/:id/revenue-reports
router.get("/contracts/:id/revenue-reports", async (req, res) => {
  const reports = await db
    .select({
      id: revenueReportsTable.id,
      contractId: revenueReportsTable.contractId,
      period: revenueReportsTable.period,
      expectedDate: revenueReportsTable.expectedDate,
      receivedDate: revenueReportsTable.receivedDate,
      amount: revenueReportsTable.amount,
      status: revenueReportsTable.status,
      createdAt: revenueReportsTable.createdAt,
      partnerName: partnersTable.name,
    })
    .from(revenueReportsTable)
    .leftJoin(contractsTable, eq(revenueReportsTable.contractId, contractsTable.id))
    .leftJoin(partnersTable, eq(contractsTable.partnerId, partnersTable.id))
    .where(eq(revenueReportsTable.contractId, req.params.id))
    .orderBy(desc(revenueReportsTable.expectedDate));

  res.json(reports.map(r => ({ ...r, amount: r.amount ? Number(r.amount) : null })));
});

// POST /api/contracts/:id/revenue-reports
router.post("/contracts/:id/revenue-reports", requireRole("admin", "finance"), async (req, res) => {
  const { period, expectedDate, receivedDate, amount, status } = req.body;

  if (!period || !status) {
    res.status(400).json({ message: "period and status are required" });
    return;
  }

  const id = crypto.randomUUID();
  const [report] = await db
    .insert(revenueReportsTable)
    .values({
      id,
      contractId: req.params.id,
      period,
      expectedDate: expectedDate || null,
      receivedDate: receivedDate || null,
      amount: amount?.toString() || null,
      status: status || "expected",
    })
    .returning();

  await logAudit({ user: req.user, action: "create", entityType: "revenue_report", entityId: id, after: { contractId: req.params.id, period } });
  res.status(201).json({ ...report, amount: report.amount ? Number(report.amount) : null, partnerName: null });
});

// GET /api/revenue-reports (all)
router.get("/revenue-reports", requireRole("admin", "finance"), async (req, res) => {
  const page = parseInt(req.query.page as string) || 1;
  const pageSize = parseInt(req.query.pageSize as string) || 20;
  const status = req.query.status as string | undefined;
  const contractId = req.query.contractId as string | undefined;

  const conditions: any[] = [];
  if (status) conditions.push(eq(revenueReportsTable.status, status as any));
  if (contractId) conditions.push(eq(revenueReportsTable.contractId, contractId));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [reports, [{ value: total }]] = await Promise.all([
    db
      .select({
        id: revenueReportsTable.id,
        contractId: revenueReportsTable.contractId,
        period: revenueReportsTable.period,
        expectedDate: revenueReportsTable.expectedDate,
        receivedDate: revenueReportsTable.receivedDate,
        amount: revenueReportsTable.amount,
        status: revenueReportsTable.status,
        createdAt: revenueReportsTable.createdAt,
        partnerName: partnersTable.name,
      })
      .from(revenueReportsTable)
      .leftJoin(contractsTable, eq(revenueReportsTable.contractId, contractsTable.id))
      .leftJoin(partnersTable, eq(contractsTable.partnerId, partnersTable.id))
      .where(where)
      .orderBy(desc(revenueReportsTable.expectedDate))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ value: count() }).from(revenueReportsTable).where(where),
  ]);

  res.json({
    data: reports.map(r => ({ ...r, amount: r.amount ? Number(r.amount) : null })),
    total: Number(total),
    page,
    pageSize,
  });
});

// PUT /api/revenue-reports/:id
router.put("/revenue-reports/:id", requireRole("admin", "finance"), async (req, res) => {
  const { period, expectedDate, receivedDate, amount, status } = req.body;

  const [report] = await db
    .update(revenueReportsTable)
    .set({
      period,
      expectedDate: expectedDate || null,
      receivedDate: receivedDate || null,
      amount: amount?.toString() || null,
      status,
    })
    .where(eq(revenueReportsTable.id, req.params.id))
    .returning();

  if (!report) {
    res.status(404).json({ message: "Revenue report not found" });
    return;
  }

  await logAudit({ user: req.user, action: "update", entityType: "revenue_report", entityId: req.params.id });
  res.json({ ...report, amount: report.amount ? Number(report.amount) : null, partnerName: null });
});

// DELETE /api/revenue-reports/:id
router.delete("/revenue-reports/:id", requireRole("admin", "finance"), async (req, res) => {
  await db.delete(revenueReportsTable).where(eq(revenueReportsTable.id, req.params.id));
  await logAudit({ user: req.user, action: "delete", entityType: "revenue_report", entityId: req.params.id });
  res.json({ message: "Revenue report deleted" });
});

export default router;
