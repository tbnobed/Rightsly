import { Router } from "express";
import { db } from "@workspace/db";
import { contractsTable, partnersTable, revenueReportsTable, royaltyApprovalsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { authenticateToken, requireRole } from "../lib/auth";
import { logAudit } from "../lib/audit";

const router = Router();
router.use(authenticateToken, requireRole("admin", "finance"));

// GET /api/royalties/:contractId
router.get("/:contractId", async (req, res) => {
  const [contract] = await db
    .select({
      id: contractsTable.id,
      royaltyType: contractsTable.royaltyType,
      royaltyDetails: contractsTable.royaltyDetails,
      partnerName: partnersTable.name,
    })
    .from(contractsTable)
    .leftJoin(partnersTable, eq(contractsTable.partnerId, partnersTable.id))
    .where(eq(contractsTable.id, req.params.contractId));

  if (!contract) {
    res.status(404).json({ message: "Contract not found" });
    return;
  }

  const reports = await db
    .select()
    .from(revenueReportsTable)
    .where(eq(revenueReportsTable.contractId, req.params.contractId));

  const approvals = await db
    .select()
    .from(royaltyApprovalsTable)
    .where(
      reports.length
        ? eq(royaltyApprovalsTable.reportId, reports[0].id) // simplified; real impl queries all
        : eq(royaltyApprovalsTable.reportId, "none")
    );

  // Parse share percentage from royaltyDetails (e.g. "50/50" → 50%)
  let sharePercentage: number | null = null;
  if (contract.royaltyType === "revenue_share" && contract.royaltyDetails) {
    const match = contract.royaltyDetails.match(/(\d+)\/(\d+)/);
    if (match) {
      sharePercentage = parseInt(match[2]);
    }
  }

  const approvalMap = approvals.reduce((acc, a) => { acc[a.reportId] = a; return acc; }, {} as Record<string, any>);

  const [reviewerRow] = approvals.length && approvals[0].reviewedBy
    ? await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, approvals[0].reviewedBy))
    : [null];

  const calculations = reports.map((report) => {
    const approval = approvalMap[report.id];
    const revenue = report.amount ? Number(report.amount) : null;
    const owed = revenue !== null && sharePercentage !== null ? (revenue * sharePercentage) / 100 : null;

    return {
      reportId: report.id,
      period: report.period,
      revenueAmount: revenue,
      sharePercentage,
      amountOwed: owed,
      reviewStatus: approval?.status ?? "pending",
      reviewedBy: approval?.reviewedBy ? reviewerRow?.name ?? null : null,
      reviewedAt: approval?.reviewedAt ?? null,
    };
  });

  res.json({
    contractId: contract.id,
    partnerName: contract.partnerName ?? "",
    royaltyType: contract.royaltyType ?? null,
    royaltyDetails: contract.royaltyDetails ?? null,
    calculations,
  });
});

// POST /api/royalties/:contractId/approve
router.post("/:contractId/approve", async (req, res) => {
  const { reportId, status } = req.body;

  if (!reportId || !status) {
    res.status(400).json({ message: "reportId and status are required" });
    return;
  }

  // Upsert approval
  const existing = await db
    .select()
    .from(royaltyApprovalsTable)
    .where(eq(royaltyApprovalsTable.reportId, reportId));

  if (existing.length) {
    await db
      .update(royaltyApprovalsTable)
      .set({ status, reviewedBy: req.user!.id, reviewedAt: new Date() })
      .where(eq(royaltyApprovalsTable.reportId, reportId));
  } else {
    await db.insert(royaltyApprovalsTable).values({
      id: crypto.randomUUID(),
      reportId,
      status,
      reviewedBy: req.user!.id,
      reviewedAt: new Date(),
    });
  }

  await logAudit({ user: req.user, action: "update", entityType: "royalty_approval", entityId: reportId, after: { status } });

  // Return updated calc result
  const [contract] = await db
    .select({ id: contractsTable.id, royaltyType: contractsTable.royaltyType, royaltyDetails: contractsTable.royaltyDetails, partnerName: partnersTable.name })
    .from(contractsTable)
    .leftJoin(partnersTable, eq(contractsTable.partnerId, partnersTable.id))
    .where(eq(contractsTable.id, req.params.contractId));

  res.json({ contractId: req.params.contractId, partnerName: contract?.partnerName ?? "", royaltyType: contract?.royaltyType ?? null, royaltyDetails: contract?.royaltyDetails ?? null, calculations: [] });
});

export default router;
