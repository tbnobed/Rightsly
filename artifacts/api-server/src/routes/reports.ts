import { Router } from "express";
import { db } from "@workspace/db";
import { contractsTable, revenueReportsTable, partnersTable } from "@workspace/db";
import { eq, and, or, lte, gte, desc, sql, asc, getTableColumns } from "drizzle-orm";
import archiver from "archiver";
import { authenticateToken, requireRole } from "../lib/auth";
import { logAudit } from "../lib/audit";
import { canViewFinancials } from "../lib/rolePolicy";
import { sendPdfReport } from "../lib/pdfReport";
import { displayContractStatus } from "../lib/contractStatus";
import { formatRevenueAmount } from "../lib/revenueCore";
import {
  exportHeaders, portableExportTablesForRole, PORTABLE_EXPORT_README, sanitizePortableRecord, serializePortableCsv,
} from "../lib/portableExport";

const router = Router();
router.use(authenticateToken);

// GET /api/reports/export-all
// This portable export intentionally includes metadata, not uploaded object bytes.
router.get("/export-all", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store, private");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("X-Content-Type-Options", "nosniff");
  next();
}, requireRole("admin", "content_admin"), async (req, res): Promise<void> => {
  const datasets: { filename: string; csv: string; rowCount: number; headers: string[] }[] = [];
  for (const spec of portableExportTablesForRole(req.user!.role)) {
    const columns = getTableColumns(spec.table) as Record<string, any>;
    const rows = await (db.select().from(spec.table as any).orderBy(
      ...spec.orderBy.map((field) => asc(columns[field])),
    ) as Promise<Record<string, unknown>[]>);
    const headers = exportHeaders(spec);
    datasets.push({
      filename: spec.filename,
      csv: serializePortableCsv(headers, rows.map(sanitizePortableRecord)),
      rowCount: rows.length,
      headers,
    });
  }

  const generatedAt = new Date().toISOString();
  const manifest = {
    format: "rightsly-portable-export-v1",
    generatedAt,
    tables: datasets.map(({ filename, rowCount, headers }) => ({ filename, rowCount, headers })),
    excludedFields: ["users.passwordHash", "users.inviteTokenHash"],
    roleRestrictedDatasets: req.user?.role === "admin" ? [] : ["users.csv", "audit_logs.csv"],
    attachments: "Metadata and object paths only; uploaded binaries are excluded.",
  };
  await logAudit({
    user: req.user,
    action: "export",
    entityType: "portable_export",
    after: { tableCount: datasets.length, rowCount: datasets.reduce((total, item) => total + item.rowCount, 0) },
  });

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="rightsly-export-${generatedAt.slice(0, 10)}.zip"`);
  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.on("error", (error: Error) => {
    req.log.error({ err: error }, "Portable export archive failed");
    res.destroy(error);
  });
  archive.pipe(res);
  for (const dataset of datasets) archive.append(dataset.csv, { name: dataset.filename, date: new Date(0) });
  archive.append(PORTABLE_EXPORT_README, { name: "README.txt", date: new Date(0) });
  archive.append(`${JSON.stringify(manifest, null, 2)}\n`, { name: "manifest.json", date: new Date(0) });
  await archive.finalize();
});

async function getContractsData(params: any) {
  const { direction, status, from, to, platform, territory, salesOnly } = params;
  const today = new Date().toISOString().split("T")[0];
  const conditions: any[] = [];
  if (direction && direction !== "all") conditions.push(eq(contractsTable.direction, direction));
  if (status === "active") {
    conditions.push(
      and(
        eq(contractsTable.status, "active"),
        sql`(${contractsTable.endType} <> 'date' OR ${contractsTable.endDate} >= ${today})`,
      ),
    );
  } else if (status === "expired") {
    conditions.push(
      or(
        eq(contractsTable.status, "expired"),
        and(
          eq(contractsTable.status, "active"),
          eq(contractsTable.endType, "date"),
          sql`${contractsTable.endDate} < ${today}`,
        ),
      ),
    );
  } else if (status && status !== "all") {
    conditions.push(eq(contractsTable.status, status));
  }
  if (from) conditions.push(gte(contractsTable.startDate, from));
  if (to) conditions.push(lte(contractsTable.endDate, to));
  if (salesOnly) {
    conditions.push(eq(contractsTable.status, "active"));
    conditions.push(eq(contractsTable.archived, false));
    conditions.push(sql`(${contractsTable.endType} <> 'date' OR ${contractsTable.endDate} >= ${today})`);
  }
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
      platform: contractsTable.platform,
      rightsInPlatforms: contractsTable.rightsInPlatforms,
      distributionTypes: contractsTable.distributionTypes,
      royaltyType: contractsTable.royaltyType,
      contentCount: sql<number>`(select count(*) from contract_content where contract_content.contract_id = ${contractsTable.id})`.mapWith(Number),
      createdAt: contractsTable.createdAt,
    })
    .from(contractsTable)
    .leftJoin(partnersTable, eq(contractsTable.partnerId, partnersTable.id))
    .where(where)
    .orderBy(desc(contractsTable.createdAt))
    .then((contracts) => contracts.map((contract) => ({
      ...contract,
      platform: contract.platform || contract.rightsInPlatforms?.join(", ") || null,
    })).filter((contract) =>
      (!platform || contract.platform?.split(", ").includes(platform)) &&
      (!territory || (contract.territories as string[]).includes(territory))
    ));
}

// GET /api/reports/contracts
router.get("/contracts", async (req, res) => {
  const { direction, status, from, to, platform, territory, format } = req.query as Record<string, string>;
  const hasFinancialAccess = canViewFinancials(req.user?.role);
  const data = (await getContractsData({
    direction,
    status,
    from,
    to,
    platform,
    territory,
    salesOnly: req.user?.role === "sales",
  }))
    .map((contract) => displayContractStatus({
      ...contract,
      royaltyType: hasFinancialAccess ? contract.royaltyType : null,
    }));

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
      { header: "Platform", key: "platform", width: 20 },
      { header: "Territories", key: "territories", width: 20 },
      { header: "Distribution Types", key: "distributionTypes", width: 25 },
      { header: "Royalty Type", key: "royaltyType", width: 15 },
    ];
    data.forEach((row) => ws.addRow({
      ...row,
        platform: row.platform ?? "",
        territories: (row.territories as string[]).join(", "),
      distributionTypes: (row.distributionTypes as string[]).join(", "),
    }));

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=contracts-${new Date().toISOString().split("T")[0]}.xlsx`);
    await wb.xlsx.write(res);
    return;
  }

  if (format === "pdf") {
    await sendPdfReport(res, {
      filename: `contracts-${new Date().toISOString().split("T")[0]}.pdf`,
      title: "Contract Summaries",
      columns: [
        { header: "Partner", key: "partnerName", width: 3 },
        { header: "Direction", key: "direction", width: 2 },
        { header: "Status", key: "status", width: 2 },
        { header: "Start Date", key: "startDate", width: 2 },
        { header: "End Date", key: "endDate", width: 2 },
        { header: "Platform", key: "platform", width: 2 },
        { header: "Territories", key: "territories", width: 3 },
        { header: "Distribution Types", key: "distributionTypes", width: 3 },
        { header: "Royalty Type", key: "royaltyType", width: 2 },
      ],
      rows: data.map((row) => ({
        ...row,
        platform: row.platform ?? "",
        territories: (row.territories as string[]).join(", "),
        distributionTypes: (row.distributionTypes as string[]).join(", "),
      })),
    });
    return;
  }

  res.json({ data, generatedAt: new Date().toISOString() });
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
        eq(contractsTable.archived, false),
        eq(contractsTable.endType, "date"),
        lte(contractsTable.endDate, cutoff.toISOString().split("T")[0]),
        gte(contractsTable.endDate, new Date().toISOString().split("T")[0])
      )
    )
    .orderBy(contractsTable.endDate);
  const hasFinancialAccess = canViewFinancials(req.user?.role);
  const visibleData = data.map((contract) => ({
    ...contract,
      royaltyType: hasFinancialAccess ? contract.royaltyType : null,
  }));

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
    visibleData.forEach((row) => ws.addRow({ ...row, territories: (row.territories as string[]).join(", ") }));
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=expiring-contracts-${new Date().toISOString().split("T")[0]}.xlsx`);
    await wb.xlsx.write(res);
    return;
  }

  if (format === "pdf") {
    await sendPdfReport(res, {
      filename: `expiring-contracts-${new Date().toISOString().split("T")[0]}.pdf`,
      title: "Expiring Soon Contracts",
      subtitle: `Contracts expiring within ${withinDays} days — generated ${new Date().toISOString().split("T")[0]}`,
      columns: [
        { header: "Partner", key: "partnerName", width: 3 },
        { header: "Direction", key: "direction", width: 2 },
        { header: "Status", key: "status", width: 2 },
        { header: "End Date", key: "endDate", width: 2 },
        { header: "Territories", key: "territories", width: 3 },
      ],
      rows: visibleData,
    });
    return;
  }

  res.json({ data: visibleData.map((contract) => displayContractStatus(contract)).map(d => ({ ...d, contentCount: 0 })), generatedAt: new Date().toISOString() });
});

// GET /api/reports/royalties
router.get("/royalties", requireRole("admin", "finance"), async (req, res) => {
  const { contractId, from, to, status, format } = req.query as Record<string, string>;

  const conditions: any[] = [];
  if (contractId) conditions.push(eq(revenueReportsTable.contractId, contractId));
  if (from) conditions.push(gte(revenueReportsTable.expectedDate, from));
  if (to) conditions.push(lte(revenueReportsTable.expectedDate, to));
  if (status && status !== "all") conditions.push(eq(revenueReportsTable.status, status as any));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const data = await db
    .select({
      id: revenueReportsTable.id,
      contractId: revenueReportsTable.contractId,
      period: revenueReportsTable.period,
      expectedDate: revenueReportsTable.expectedDate,
      receivedDate: revenueReportsTable.receivedDate,
      amountReceived: sql<string | null>`coalesce(${revenueReportsTable.amountReceived}, ${revenueReportsTable.amount})`,
      costAmount: revenueReportsTable.costAmount,
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
      { header: "Amount Received", key: "amountReceived", width: 18 },
      { header: "Cost Amount", key: "costAmount", width: 15 },
      { header: "Status", key: "status", width: 12 },
    ];
    data.forEach((row) => ws.addRow({
      ...row,
      amountReceived: row.amountReceived === null || row.amountReceived === undefined ? null : Number(row.amountReceived),
      costAmount: row.costAmount === null || row.costAmount === undefined ? null : Number(row.costAmount),
    }));
    ws.getColumn("amountReceived").numFmt = '$#,##0.00;[Red]-$#,##0.00';
    ws.getColumn("costAmount").numFmt = '$#,##0.00;[Red]-$#,##0.00';
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=royalty-statements-${new Date().toISOString().split("T")[0]}.xlsx`);
    await wb.xlsx.write(res);
    return;
  }

  if (format === "pdf") {
    await sendPdfReport(res, {
      filename: `royalty-statements-${new Date().toISOString().split("T")[0]}.pdf`,
      title: "Royalty Statements",
      columns: [
        { header: "Partner", key: "partnerName", width: 3 },
        { header: "Period", key: "period", width: 2 },
        { header: "Expected Date", key: "expectedDate", width: 2 },
        { header: "Received Date", key: "receivedDate", width: 2 },
        { header: "Received", key: "amountReceived", width: 2 },
        { header: "Cost", key: "costAmount", width: 2 },
        { header: "Status", key: "status", width: 2 },
      ],
      rows: data.map(r => ({
        ...r,
        amountReceived: formatRevenueAmount(r.amountReceived),
        costAmount: formatRevenueAmount(r.costAmount),
      })),
    });
    return;
  }

  res.json({
    data: data.map(r => ({
      ...r,
      amountReceived: r.amountReceived ? Number(r.amountReceived) : null,
      costAmount: r.costAmount ? Number(r.costAmount) : null,
    })),
    generatedAt: new Date().toISOString(),
  });
});

export default router;
