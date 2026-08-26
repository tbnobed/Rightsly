import { Router } from "express";
import { db } from "@workspace/db";
import { contractsTable, partnersTable, revenueReportsTable, royaltyApprovalsTable } from "@workspace/db";
import { and, count, desc, eq } from "drizzle-orm";
import { authenticateToken, requireRole } from "../lib/auth";
import { logAudit } from "../lib/audit";
import { routeParam } from "../lib/validation";
import { deriveRevenueStatus } from "../lib/revenueCore";

const router = Router();
router.use(authenticateToken);

const statuses = new Set(["expected", "received", "overdue"]);
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function validDate(value: unknown): value is string {
  return typeof value === "string" && datePattern.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function nullableDate(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return validDate(value) ? value : undefined;
}

function nullableMoney(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "number" && typeof value !== "string") return undefined;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue >= 0 ? String(numberValue) : undefined;
}

function serialize(report: {
  amountReceived: string | null;
  legacyAmount: string | null;
  costAmount: string | null;
  [key: string]: unknown;
}) {
  const { legacyAmount, ...visible } = report;
  return {
    ...visible,
    amountReceived: report.amountReceived === null
      ? (legacyAmount === null ? null : Number(legacyAmount))
      : Number(report.amountReceived),
    costAmount: report.costAmount === null ? null : Number(report.costAmount),
  };
}

async function contractExists(contractId: string) {
  const [contract] = await db.select({ id: contractsTable.id }).from(contractsTable).where(eq(contractsTable.id, contractId)).limit(1);
  return contract;
}

const reportSelection = {
  id: revenueReportsTable.id,
  contractId: revenueReportsTable.contractId,
  period: revenueReportsTable.period,
  expectedDate: revenueReportsTable.expectedDate,
  receivedDate: revenueReportsTable.receivedDate,
  amountReceived: revenueReportsTable.amountReceived,
  legacyAmount: revenueReportsTable.amount,
  costAmount: revenueReportsTable.costAmount,
  status: revenueReportsTable.status,
  documentPath: revenueReportsTable.documentPath,
  documentName: revenueReportsTable.documentName,
  createdAt: revenueReportsTable.createdAt,
  partnerName: partnersTable.name,
};

router.get("/contracts/:id/revenue-reports", requireRole("admin", "finance"), async (req, res): Promise<void> => {
  const contractId = routeParam(req.params.id);
  if (!contractId || !(await contractExists(contractId))) {
    res.status(404).json({ message: "Contract not found" });
    return;
  }
  const reports = await db.select(reportSelection).from(revenueReportsTable)
    .leftJoin(contractsTable, eq(revenueReportsTable.contractId, contractsTable.id))
    .leftJoin(partnersTable, eq(contractsTable.partnerId, partnersTable.id))
    .where(eq(revenueReportsTable.contractId, contractId)).orderBy(desc(revenueReportsTable.expectedDate));
  res.json(reports.map(serialize));
});

router.post("/contracts/:id/revenue-reports", requireRole("admin", "finance"), async (req, res): Promise<void> => {
  const contractId = routeParam(req.params.id);
  const { period, expectedDate, receivedDate, amountReceived, costAmount, status } = req.body ?? {};
  if (!contractId || !(await contractExists(contractId))) {
    res.status(404).json({ message: "Contract not found" });
    return;
  }
  if (typeof period !== "string" || !period.trim() || period.length > 100 || !statuses.has(status)) {
    res.status(400).json({ message: "period and a valid status are required" });
    return;
  }
  const normalizedExpectedDate = nullableDate(expectedDate);
  const normalizedReceivedDate = nullableDate(receivedDate);
  const normalizedReceived = nullableMoney(amountReceived);
  const normalizedCost = nullableMoney(costAmount);
  if ((expectedDate !== undefined && normalizedExpectedDate === undefined) || (receivedDate !== undefined && normalizedReceivedDate === undefined) ||
      (amountReceived !== undefined && normalizedReceived === undefined) || (costAmount !== undefined && normalizedCost === undefined)) {
    res.status(400).json({ message: "Dates must be YYYY-MM-DD and amounts must be non-negative numbers" });
    return;
  }
  if (status === "received" && (!normalizedReceivedDate || normalizedReceived === null || normalizedReceived === undefined)) {
    res.status(400).json({ message: "receivedDate and amountReceived are required when status is received" });
    return;
  }
  const id = crypto.randomUUID();
  const effectiveStatus = deriveRevenueStatus(status, normalizedReceivedDate ?? null, normalizedReceived ?? null);
  const [report] = await db.insert(revenueReportsTable).values({
    id, contractId, period: period.trim(), expectedDate: normalizedExpectedDate ?? null, receivedDate: normalizedReceivedDate ?? null,
    amountReceived: normalizedReceived ?? null, costAmount: normalizedCost ?? null, status: effectiveStatus,
  }).returning();
  await db.insert(royaltyApprovalsTable).values({ id: crypto.randomUUID(), reportId: id, status: "pending" });
  await logAudit({ user: req.user, action: "create", entityType: "revenue_report", entityId: id, after: { contractId, period: report.period } });
  res.status(201).json(serialize({ ...report, legacyAmount: report.amount, partnerName: null }));
});

router.get("/revenue-reports", requireRole("admin", "finance"), async (req, res): Promise<void> => {
  const page = Math.max(1, Number.parseInt(String(req.query.page), 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(String(req.query.pageSize), 10) || 20));
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const contractId = typeof req.query.contractId === "string" ? req.query.contractId : undefined;
  if (status && !statuses.has(status)) { res.status(400).json({ message: "Invalid status" }); return; }
  const conditions = [status ? eq(revenueReportsTable.status, status as "expected" | "received" | "overdue") : undefined, contractId ? eq(revenueReportsTable.contractId, contractId) : undefined].filter(Boolean) as ReturnType<typeof eq>[];
  const where = conditions.length ? and(...conditions) : undefined;
  const [reports, totals] = await Promise.all([
    db.select(reportSelection).from(revenueReportsTable).leftJoin(contractsTable, eq(revenueReportsTable.contractId, contractsTable.id)).leftJoin(partnersTable, eq(contractsTable.partnerId, partnersTable.id)).where(where).orderBy(desc(revenueReportsTable.expectedDate)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ value: count() }).from(revenueReportsTable).where(where),
  ]);
  res.json({ data: reports.map(serialize), total: Number(totals[0]?.value ?? 0), page, pageSize });
});

router.put("/revenue-reports/:id", requireRole("admin", "finance"), async (req, res): Promise<void> => {
  const id = routeParam(req.params.id);
  const body = req.body ?? {};
  if (!id || Object.keys(body).length === 0) { res.status(400).json({ message: "At least one field is required" }); return; }
  if ((body.period !== undefined && (typeof body.period !== "string" || !body.period.trim() || body.period.length > 100)) || (body.status !== undefined && !statuses.has(body.status))) {
    res.status(400).json({ message: "Invalid period or status" }); return;
  }
  const expectedDate = nullableDate(body.expectedDate), receivedDate = nullableDate(body.receivedDate);
  const amountReceived = nullableMoney(body.amountReceived), costAmount = nullableMoney(body.costAmount);
  if ((body.expectedDate !== undefined && expectedDate === undefined) || (body.receivedDate !== undefined && receivedDate === undefined) || (body.amountReceived !== undefined && amountReceived === undefined) || (body.costAmount !== undefined && costAmount === undefined)) {
    res.status(400).json({ message: "Dates must be YYYY-MM-DD and amounts must be non-negative numbers" }); return;
  }
  const [current] = await db.select().from(revenueReportsTable).where(eq(revenueReportsTable.id, id)).limit(1);
  if (!current) { res.status(404).json({ message: "Revenue report not found" }); return; }
  const requestedStatus = body.status ?? current.status;
  const effectiveReceivedDate = body.receivedDate === undefined ? current.receivedDate : receivedDate;
  const effectiveAmountReceived = body.amountReceived === undefined
    ? (current.amountReceived ?? current.amount)
    : amountReceived;
  if (body.status === "received" && (!effectiveReceivedDate || effectiveAmountReceived === null || effectiveAmountReceived === undefined)) {
    res.status(400).json({ message: "receivedDate and amountReceived are required when status is received" }); return;
  }
  const effectiveStatus = deriveRevenueStatus(requestedStatus, effectiveReceivedDate ?? null, effectiveAmountReceived ?? null);
  const updates = {
    ...(body.period !== undefined ? { period: body.period.trim() } : {}),
    ...(body.status !== undefined || effectiveStatus !== current.status ? { status: effectiveStatus } : {}),
    ...(body.expectedDate !== undefined ? { expectedDate } : {}),
    ...(body.receivedDate !== undefined ? { receivedDate } : {}),
    ...(body.amountReceived !== undefined ? { amountReceived } : {}),
    ...(body.costAmount !== undefined ? { costAmount } : {}),
    ...(body.documentPath !== undefined ? { documentPath: typeof body.documentPath === "string" && body.documentPath.startsWith("/objects/") ? body.documentPath : null } : {}),
    ...(body.documentName !== undefined ? { documentName: typeof body.documentName === "string" && body.documentName.trim() ? body.documentName.trim().slice(0, 255) : null } : {}),
  };
  if (body.documentPath !== undefined && body.documentPath !== null && (!updates.documentPath || body.documentName === undefined)) { res.status(400).json({ message: "A valid object path and document name are required" }); return; }
  const [report] = await db.update(revenueReportsTable).set(updates).where(eq(revenueReportsTable.id, id)).returning();
  const financialChange = effectiveStatus !== current.status ||
    ["period", "expectedDate", "receivedDate", "amountReceived", "costAmount", "status"].some((field) => body[field] !== undefined);
  if (financialChange) await db.update(royaltyApprovalsTable).set({ status: "pending", reviewedBy: null, reviewedAt: null }).where(eq(royaltyApprovalsTable.reportId, id));
  await logAudit({ user: req.user, action: "update", entityType: "revenue_report", entityId: id });
  res.json(serialize({ ...report, legacyAmount: report.amount, partnerName: null }));
});

router.delete("/revenue-reports/:id", requireRole("admin", "finance"), async (req, res): Promise<void> => {
  const id = routeParam(req.params.id);
  const [deleted] = await db.delete(revenueReportsTable).where(eq(revenueReportsTable.id, id)).returning({ id: revenueReportsTable.id });
  if (!deleted) { res.status(404).json({ message: "Revenue report not found" }); return; }
  await logAudit({ user: req.user, action: "delete", entityType: "revenue_report", entityId: id });
  res.json({ message: "Revenue report deleted" });
});

export default router;