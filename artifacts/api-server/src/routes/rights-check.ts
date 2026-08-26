import { Router } from "express";
import { db } from "@workspace/db";
import { contractsTable, contractContentTable, contentItemsTable, partnersTable } from "@workspace/db";
import { eq, and, or } from "drizzle-orm";
import { authenticateToken } from "../lib/auth";
import { territoriesOverlap } from "../lib/rightsMatching";
import {
  distributionTypesIntersect,
  isRecognizedDistributionType,
  isRecognizedTerritory,
} from "../lib/rightsVocabulary";

const router = Router();
router.use(authenticateToken);

// GET /api/rights-check
router.get("/", async (req, res) => {
  const queryValues = [
    req.query.contentItemId,
    req.query.territory,
    req.query.distributionType,
    req.query.date,
  ];
  if (queryValues.some((value) => value !== undefined && typeof value !== "string")) {
    res.status(400).json({ message: "contentItemId, territory, distributionType, and date must be single string values" });
    return;
  }
  const contentItemId = req.query.contentItemId as string | undefined;
  const territory = req.query.territory as string | undefined;
  const distributionType = req.query.distributionType as string | undefined;
  const date = req.query.date as string | undefined;

  if (!contentItemId || !territory || !distributionType || !date) {
    res.status(400).json({ message: "contentItemId, territory, distributionType, date are all required" });
    return;
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(contentItemId)) {
    res.status(400).json({ message: "contentItemId must be a valid UUID" });
    return;
  }
  const checkDate = new Date(`${date}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(checkDate.getTime()) ||
    checkDate.toISOString().slice(0, 10) !== date
  ) {
    res.status(400).json({ message: "date must be a valid YYYY-MM-DD value" });
    return;
  }
  if (!isRecognizedTerritory(territory)) {
    res.status(400).json({ message: `Unrecognized territory: ${territory}` });
    return;
  }
  if (!isRecognizedDistributionType(distributionType)) {
    res.status(400).json({ message: `Unrecognized distribution type: ${distributionType}` });
    return;
  }
  const [contentItem] = await db
    .select({ id: contentItemsTable.id })
    .from(contentItemsTable)
    .where(eq(contentItemsTable.id, contentItemId));
  if (!contentItem) {
    res.status(404).json({ message: "Content item not found" });
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
        eq(contractsTable.archived, false),
        or(
          eq(contractsTable.status, "active"),
          eq(contractsTable.status, "in_perpetuity")
        )
      )
    );

  // Filter to contracts that cover the requested territory, distribution type, and date
  const matchingContracts = linkedContracts.filter((c) => {
    const territoriesMatch = territoriesOverlap(
      territory,
      c.territories as string[],
      c.otherTerritories,
    );
    const distMatch = (c.distributionTypes as string[]).some((value) =>
      distributionTypesIntersect(distributionType, value));

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
