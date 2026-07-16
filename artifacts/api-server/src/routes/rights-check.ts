import { Router } from "express";
import { db } from "@workspace/db";
import { contractsTable, contractContentTable, partnersTable } from "@workspace/db";
import { eq, and, or, lte, gte } from "drizzle-orm";
import { authenticateToken } from "../lib/auth";

const router = Router();
router.use(authenticateToken);

// GET /api/rights-check
router.get("/", async (req, res) => {
  const { contentItemId, territory, distributionType, date } = req.query as Record<string, string>;

  if (!contentItemId || !territory || !distributionType || !date) {
    res.status(400).json({ message: "contentItemId, territory, distributionType, date are all required" });
    return;
  }

  // Find all active rights-out contracts for this content item
  const linkedContracts = await db
    .select({
      id: contractsTable.id,
      direction: contractsTable.direction,
      status: contractsTable.status,
      territories: contractsTable.territories,
      otherTerritories: contractsTable.otherTerritories,
      distributionTypes: contractsTable.distributionTypes,
      startDate: contractsTable.startDate,
      endDate: contractsTable.endDate,
      endType: contractsTable.endType,
      rightsOutExclusivity: contractsTable.rightsOutExclusivity,
      partnerName: partnersTable.name,
    })
    .from(contractContentTable)
    .innerJoin(contractsTable, eq(contractContentTable.contractId, contractsTable.id))
    .leftJoin(partnersTable, eq(contractsTable.partnerId, partnersTable.id))
    .where(
      and(
        eq(contractContentTable.contentItemId, contentItemId),
        eq(contractsTable.direction, "rights_out"),
        or(
          eq(contractsTable.status, "active"),
          eq(contractsTable.status, "in_perpetuity")
        )
      )
    );

  const checkDate = new Date(date);

  // Filter to contracts that cover the requested territory, distribution type, and date
  const matchingContracts = linkedContracts.filter((c) => {
    const territoriesMatch =
      (c.territories as string[]).includes("Global") ||
      (c.territories as string[]).includes(territory);
    const distMatch = (c.distributionTypes as string[]).includes(distributionType);

    let dateMatch = true;
    if (c.endType === "date" && c.endDate) {
      dateMatch = checkDate <= new Date(c.endDate);
    }
    if (c.startDate) {
      dateMatch = dateMatch && checkDate >= new Date(c.startDate);
    }

    return territoriesMatch && distMatch && dateMatch;
  });

  // Find conflicts: exclusive Rights Out deals
  const conflicts = matchingContracts
    .filter((c) => c.rightsOutExclusivity === "exclusive")
    .map((c) => ({
      contractId: c.id,
      partnerName: c.partnerName ?? "",
      reason: `Exclusive Rights Out contract with ${c.partnerName} covers ${territory} / ${distributionType}`,
      territory,
      distributionType,
    }));

  const grants = matchingContracts.map((c) => ({
    contractId: c.id,
    partnerName: c.partnerName ?? "",
    direction: c.direction,
    exclusivity: c.rightsOutExclusivity,
    territories: c.territories as string[],
    distributionTypes: c.distributionTypes as string[],
    startDate: c.startDate,
    endDate: c.endDate,
  }));

  res.json({
    available: conflicts.length === 0,
    conflicts,
    grants,
  });
});

export default router;
