import { Router } from "express";
import { db } from "@workspace/db";
import { contractsTable, revenueReportsTable, partnersTable } from "@workspace/db";
import { eq, and, lte, gte, desc } from "drizzle-orm";
import { authenticateToken, requireRole } from "../lib/auth";

const router = Router();
router.use(authenticateToken);

async function getContractsData(params: any) {
  const { direction, status, from, to } = params;
  const conditions: any[] = [];
  if (direction) conditions.push(eq(contractsTable.direction, direction));
  if (status) conditions.push(eq(contractsTable.status, status));
  if (from) conditions.push(gte(contractsTable.startDate, from));
  if (to) conditions.push(lte(contractsTable.endDate, to));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  return db
    .select({
      id: contractsTable.id,
      direction: contractsTable.direction,
      partnerId: contractsTable.partnerId,
      partnerName: partnersTable.name,
      licensor: contractsTable.licensor,
      licensee: contractsTable.licensee,
      status: contractsTable.status,
      startDate: contractsTable.startDate,
      endType: contractsTable.endType,
      endDate: contractsTable.endDate,
      territories: contractsTable.territories,
      distributionTypes: contractsTable.distributionTypes,
      royaltyType: contractsTable.royaltyType,
      createdAt: contractsTable.createdAt,
    })
    .from(contractsTable)
    .leftJoin(partnersTable, eq(contractsTable.partnerId, partnersTable.id))
    .where(where)
    .orderBy(desc(contractsTable.createdAt));
}

// GET /api/reports/contracts
router.get("/contracts", async (req, res) => {
  const { direction, status, from, to, format } = req.query as Record<string, string>;
  const data = await getContractsData({ direction, status, from, to });

  if (format === "xlsx") {
    const ExcelJS = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Contracts");
    ws.columns = [
      { header: "ID", key: "id", width: 36 },
      { header: "Direction", key: "direction", width: 12 },
      { header: "Partner", key: "partnerName", width: 25 },
      { header: "Status", key: "status", width: 15 },
      { header: "Start Date", key: "startDate", width: 12 },
      { header: "End Date", key: "endDate", width: 12 },
      { header: "Territories", key: "territories", width: 20 },
      { header: "Distribution Types", key: "distributionTypes", width: 25 },
      { header: "Royalty Type", key: "royaltyType", width: 15 },
    ];
    data.forEach((row) => ws.addRow({
      ...row,
      territories: (row.territories as string[]).join(", "),
      distributionTypes: (row.distributionTypes as string[]).join(", "),
    }));

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=contracts-${new Date().toISOString().split("T")[0]}.xlsx`);
    await wb.xlsx.write(res);
    return;
  }

  res.json({ data: data.map(d => ({ ...d, contentCount: 0 })), generatedAt: new Date().toISOString() });
});

// GET /api/reports/expiring
router.get("/expiring", async (req, res) => {
  const withinDays = parseInt(req.query.withinDays as string) || 60;
  const format = req.query.format as string | undefined;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + withinDays);

  const data = await db
    .select({
      id: contractsTable.id,
      direction: contractsTable.direction,
      partnerId: contractsTable.partnerId,
      partnerName: partnersTable.name,
      licensor: contractsTable.licensor,
      licensee: contractsTable.licensee,
      status: contractsTable.status,
      startDate: contractsTable.startDate,
      endType: contractsTable.endType,
      endDate: contractsTable.endDate,
      territories: contractsTable.territories,
      distributionTypes: contractsTable.distributionTypes,
      royaltyType: contractsTable.royaltyType,
      createdAt: contractsTable.createdAt,
    })
    .from(contractsTable)
    .leftJoin(partnersTable, eq(contractsTable.partnerId, partnersTable.id))
    .where(
      and(
        eq(contractsTable.status, "active"),
        eq(contractsTable.endType, "date"),
        lte(contractsTable.endDate, cutoff.toISOString().split("T")[0]),
        gte(contractsTable.endDate, new Date().toISOString().split("T")[0])
      )
    )
    .orderBy(contractsTable.endDate);

  if (format === "xlsx") {
    const ExcelJS = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Expiring Contracts");
    ws.columns = [
      { header: "Partner", key: "partnerName", width: 25 },
      { header: "Direction", key: "direction", width: 12 },
      { header: "Status", key: "status", width: 12 },
      { header: "End Date", key: "endDate", width: 12 },
      { header: "Territories", key: "territories", width: 20 },
    ];
    data.forEach((row) => ws.addRow({ ...row, territories: (row.territories as string[]).join(", ") }));
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=expiring-contracts-${new Date().toISOString().split("T")[0]}.xlsx`);
    await wb.xlsx.write(res);
    return;
  }

  res.json({ data: data.map(d => ({ ...d, contentCount: 0 })), generatedAt: new Date().toISOString() });
});

// GET /api/reports/royalties
router.get("/royalties", requireRole("admin", "finance"), async (req, res) => {
  const { contractId, from, to, format } = req.query as Record<string, string>;

  const conditions: any[] = [];
  if (contractId) conditions.push(eq(revenueReportsTable.contractId, contractId));
  if (from) conditions.push(gte(revenueReportsTable.expectedDate, from));
  if (to) conditions.push(lte(revenueReportsTable.expectedDate, to));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const data = await db
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
    .orderBy(desc(revenueReportsTable.expectedDate));

  if (format === "xlsx") {
    const ExcelJS = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Royalty Statements");
    ws.columns = [
      { header: "Partner", key: "partnerName", width: 25 },
      { header: "Period", key: "period", width: 15 },
      { header: "Expected Date", key: "expectedDate", width: 15 },
      { header: "Received Date", key: "receivedDate", width: 15 },
      { header: "Amount", key: "amount", width: 15 },
      { header: "Status", key: "status", width: 12 },
    ];
    data.forEach((row) => ws.addRow({ ...row, amount: row.amount ? Number(row.amount) : null }));
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=royalty-statements-${new Date().toISOString().split("T")[0]}.xlsx`);
    await wb.xlsx.write(res);
    return;
  }

  res.json({
    data: data.map(r => ({ ...r, amount: r.amount ? Number(r.amount) : null })),
    generatedAt: new Date().toISOString(),
  });
});

export default router;
