import { Router } from "express";
import { db } from "@workspace/db";
import { contractsTable, partnersTable, revenueReportsTable, royaltyApprovalsTable, usersTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { authenticateToken, requireRole } from "../lib/auth";
import { logAudit } from "../lib/audit";
import { routeParam } from "../lib/validation";

const router = Router();
router.use(authenticateToken, requireRole("admin", "finance"));
const reviewStatuses = new Set(["reviewed", "approved"]);

function reportResponse(report: typeof revenueReportsTable.$inferSelect, approval?: typeof royaltyApprovalsTable.$inferSelect, reviewerName?: string | null) {
  return {
    id: report.id,
    contractId: report.contractId,
    period: report.period,
    periodStart: report.periodStart,
    periodEnd: report.periodEnd,
    expectedDate: report.expectedDate,
    receivedDate: report.receivedDate,
    amountReceived: report.amountReceived === null
      ? (report.amount === null ? null : Number(report.amount))
      : Number(report.amountReceived),
    costAmount: report.costAmount === null ? null : Number(report.costAmount),
    status: report.status,
    scheduleGenerated: report.scheduleGenerated,
    documentPath: report.documentPath,
    documentName: report.documentName,
    createdAt: report.createdAt,
    reviewStatus: approval?.status ?? "pending",
    reviewedBy: reviewerName ?? null,
    reviewedAt: approval?.reviewedAt ?? null,
  };
}

// Report-first royalty review queue. No royalty, split, or amount-owed values
// are derived here; the submitted financial report is the source of record.
router.get("/:contractId", async (req, res): Promise<void> => {
  const contractId = routeParam(req.params.contractId);
  if (!contractId) { res.status(400).json({ message: "Contract id is required" }); return; }
  const [contract] = await db.select({ id: contractsTable.id, partnerName: partnersTable.name })
    .from(contractsTable).leftJoin(partnersTable, eq(contractsTable.partnerId, partnersTable.id))
    .where(eq(contractsTable.id, contractId)).limit(1);
  if (!contract) { res.status(404).json({ message: "Contract not found" }); return; }
  const reports = await db.select().from(revenueReportsTable).where(eq(revenueReportsTable.contractId, contractId));
  const reportIds = reports.map((report) => report.id);
  const approvals = reportIds.length ? await db.select().from(royaltyApprovalsTable).where(inArray(royaltyApprovalsTable.reportId, reportIds)) : [];
  const reviewerIds = approvals.flatMap((approval) => approval.reviewedBy ? [approval.reviewedBy] : []);
  const reviewers = reviewerIds.length ? await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, reviewerIds)) : [];
  const approvalByReport = new Map(approvals.map((approval) => [approval.reportId, approval]));
  const reviewerById = new Map(reviewers.map((reviewer) => [reviewer.id, reviewer.name]));
  res.json({
    contractId: contract.id,
    partnerName: contract.partnerName ?? "",
    reports: reports.map((report) => {
      const approval = approvalByReport.get(report.id);
      return reportResponse(report, approval, approval?.reviewedBy ? reviewerById.get(approval.reviewedBy) : null);
    }),
  });
});

router.post("/:contractId/approve", async (req, res): Promise<void> => {
  const contractId = routeParam(req.params.contractId);
  const { reportId, status } = req.body ?? {};
  if (!contractId || typeof reportId !== "string" || !reviewStatuses.has(status)) {
    res.status(400).json({ message: "reportId and a review status of reviewed or approved are required" });
    return;
  }
  const [report] = await db.select().from(revenueReportsTable)
    .where(eq(revenueReportsTable.id, reportId)).limit(1);
  if (!report || report.contractId !== contractId) {
    res.status(404).json({ message: "Revenue report not found for this contract" });
    return;
  }
  const [existing] = await db.select().from(royaltyApprovalsTable).where(eq(royaltyApprovalsTable.reportId, reportId)).limit(1);
  const review = { status: status as "reviewed" | "approved", reviewedBy: req.user!.id, reviewedAt: new Date() };
  const [approval] = existing
    ? await db.update(royaltyApprovalsTable).set(review).where(eq(royaltyApprovalsTable.id, existing.id)).returning()
    : await db.insert(royaltyApprovalsTable).values({ id: crypto.randomUUID(), reportId, ...review }).returning();
  await logAudit({ user: req.user, action: "update", entityType: "royalty_approval", entityId: reportId, after: { status } });
  const [reviewer] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, req.user!.id)).limit(1);
  res.json(reportResponse(report, approval, reviewer?.name));
});

export default router;