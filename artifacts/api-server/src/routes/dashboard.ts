import { Router } from "express";
import { db } from "@workspace/db";
import { contractsTable, revenueReportsTable, partnersTable } from "@workspace/db";
import { eq, and, lte, gte, count, sql } from "drizzle-orm";
import { authenticateToken } from "../lib/auth";

const router = Router();
router.use(authenticateToken);

// GET /api/dashboard
router.get("/", async (req, res) => {
  const period = (req.query.period as string) || "month";

  // Date-only, timezone-stable period boundaries (all math in UTC).
  const refParam = req.query.referenceDate as string | undefined;
  let refYear: number, refMonth: number; // refMonth is 0-based
  const m = refParam?.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
  if (m) {
    refYear = Number(m[1]);
    refMonth = Number(m[2]) - 1;
  } else {
    const now = new Date();
    refYear = now.getUTCFullYear();
    refMonth = now.getUTCMonth();
  }

  let start: Date, end: Date;
  if (period === "month") {
    start = new Date(Date.UTC(refYear, refMonth, 1));
    end = new Date(Date.UTC(refYear, refMonth + 1, 0));
  } else if (period === "quarter") {
    const q = Math.floor(refMonth / 3);
    start = new Date(Date.UTC(refYear, q * 3, 1));
    end = new Date(Date.UTC(refYear, q * 3 + 3, 0));
  } else {
    start = new Date(Date.UTC(refYear, 0, 1));
    end = new Date(Date.UTC(refYear, 11, 31));
  }

  const startStr = start.toISOString().split("T")[0];
  const endStr = end.toISOString().split("T")[0];
  const today = new Date().toISOString().split("T")[0];
  const in60Days = new Date();
  in60Days.setDate(in60Days.getDate() + 60);
  const in60DaysStr = in60Days.toISOString().split("T")[0];

  const [[{ active }], [{ expiring }], [{ upcoming }], [{ drafts }], [{ rightsIn }], [{ rightsOut }]] =
    await Promise.all([
      db.select({ active: count() }).from(contractsTable).where(eq(contractsTable.status, "active")),
      db
        .select({ expiring: count() })
        .from(contractsTable)
        .where(
          and(
            eq(contractsTable.status, "active"),
            eq(contractsTable.endType, "date"),
            lte(contractsTable.endDate, in60DaysStr),
            gte(contractsTable.endDate, today)
          )
        ),
      db
        .select({ upcoming: count() })
        .from(revenueReportsTable)
        .where(and(eq(revenueReportsTable.status, "expected"), lte(revenueReportsTable.expectedDate, in60DaysStr))),
      db.select({ drafts: count() }).from(contractsTable).where(eq(contractsTable.status, "draft")),
      db.select({ rightsIn: count() }).from(contractsTable).where(and(eq(contractsTable.direction, "rights_in"), eq(contractsTable.status, "active"))),
      db.select({ rightsOut: count() }).from(contractsTable).where(and(eq(contractsTable.direction, "rights_out"), eq(contractsTable.status, "active"))),
    ]);

  // Calendar events in the period
  const [startingContracts, expiringContracts, periodReports] = await Promise.all([
    db
      .select({
        id: contractsTable.id,
        partnerName: partnersTable.name,
        status: contractsTable.status,
        startDate: contractsTable.startDate,
      })
      .from(contractsTable)
      .leftJoin(partnersTable, eq(contractsTable.partnerId, partnersTable.id))
      .where(
        and(
          gte(contractsTable.startDate, startStr),
          lte(contractsTable.startDate, endStr)
        )
      ),
    db
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
        contentCount: sql<number>`0`.mapWith(Number),
        createdAt: contractsTable.createdAt,
      })
      .from(contractsTable)
      .leftJoin(partnersTable, eq(contractsTable.partnerId, partnersTable.id))
      .where(
        and(
          eq(contractsTable.endType, "date"),
          gte(contractsTable.endDate, startStr),
          lte(contractsTable.endDate, endStr)
        )
      ),
    db
      .select()
      .from(revenueReportsTable)
      .leftJoin(contractsTable, eq(revenueReportsTable.contractId, contractsTable.id))
      .leftJoin(partnersTable, eq(contractsTable.partnerId, partnersTable.id))
      .where(
        and(
          gte(revenueReportsTable.expectedDate, startStr),
          lte(revenueReportsTable.expectedDate, endStr)
        )
      ),
  ]);

  // Expiring soon (within 60 days)
  const expiringSoonContracts = await db
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
      contentCount: sql<number>`0`.mapWith(Number),
      createdAt: contractsTable.createdAt,
    })
    .from(contractsTable)
    .leftJoin(partnersTable, eq(contractsTable.partnerId, partnersTable.id))
    .where(
      and(
        eq(contractsTable.status, "active"),
        eq(contractsTable.endType, "date"),
        lte(contractsTable.endDate, in60DaysStr),
        gte(contractsTable.endDate, today)
      )
    );

  const calendarEvents = [
    ...startingContracts.map((c) => ({
      id: `start-${c.id}`,
      type: "contract_start" as const,
      title: `${c.partnerName ?? "Unknown"} starts`,
      date: c.startDate!,
      contractId: c.id,
      partnerName: c.partnerName,
      status: c.status,
    })),
    ...expiringContracts.map((c) => ({
      id: `exp-${c.id}`,
      type: "contract_expiry" as const,
      title: `${c.partnerName ?? "Unknown"} expires`,
      date: c.endDate!,
      contractId: c.id,
      partnerName: c.partnerName,
      status: c.status,
    })),
    ...periodReports.map((r) => ({
      id: `rev-${r.revenue_reports.id}`,
      type: r.revenue_reports.status === "overdue" ? ("revenue_report_overdue" as const) : ("revenue_report_expected" as const),
      title: `Revenue report due — ${r.partners?.name ?? "Unknown"}`,
      date: r.revenue_reports.expectedDate!,
      contractId: r.revenue_reports.contractId,
      partnerName: r.partners?.name ?? null,
      status: r.revenue_reports.status,
    })),
  ];

  res.json({
    activeContracts: Number(active),
    expiringSoon: Number(expiring),
    upcomingReports: Number(upcoming),
    draftContracts: Number(drafts),
    totalRightsIn: Number(rightsIn),
    totalRightsOut: Number(rightsOut),
    calendarEvents,
    expiringSoonContracts,
  });
});

export default router;
