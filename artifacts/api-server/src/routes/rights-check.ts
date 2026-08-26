import { Router } from "express";
import { db } from "@workspace/db";
import { contractsTable, contractContentTable, contractSeasonsTable, contentItemsTable, seasonsTable, partnersTable } from "@workspace/db";
import { eq, and, or, inArray } from "drizzle-orm";
import { authenticateToken } from "../lib/auth";
import { territoriesCover, territoriesOverlap } from "../lib/rightsMatching";
import {
  DISTRIBUTION_TYPES,
  TERRITORIES,
  canonicalDistributionType,
  canonicalTerritory,
  distributionTypeContains,
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
    req.query.seasonId,
  ];
  if (queryValues.some((value) => value !== undefined && typeof value !== "string")) {
    res.status(400).json({ message: "contentItemId, seasonId, territory, distributionType, and date must be single string values" });
    return;
  }
  const contentItemId = req.query.contentItemId as string | undefined;
  const rawTerritory = req.query.territory as string | undefined;
  const rawDistributionType = req.query.distributionType as string | undefined;
  const date = req.query.date as string | undefined;
  const seasonId = req.query.seasonId as string | undefined;

  if (!contentItemId || !rawTerritory || !rawDistributionType || !date) {
    res.status(400).json({ message: "contentItemId, territory, distributionType, date are all required" });
    return;
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(contentItemId)) {
    res.status(400).json({ message: "contentItemId must be a valid UUID" });
    return;
  }
  if (seasonId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(seasonId)) {
    res.status(400).json({ message: "seasonId must be a valid UUID" });
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
  if (!isRecognizedTerritory(rawTerritory)) {
    res.status(400).json({ message: `Unrecognized territory: ${rawTerritory}` });
    return;
  }
  if (!isRecognizedDistributionType(rawDistributionType)) {
    res.status(400).json({ message: `Unrecognized distribution type: ${rawDistributionType}` });
    return;
  }
  const territory = canonicalTerritory(rawTerritory);
  const distributionType = canonicalDistributionType(rawDistributionType);
  const [contentItem] = await db
    .select({ id: contentItemsTable.id })
    .from(contentItemsTable)
    .where(eq(contentItemsTable.id, contentItemId));
  if (!contentItem) {
    res.status(404).json({ message: "Content item not found" });
    return;
  }
  if (seasonId) {
    const [season] = await db.select({ id: seasonsTable.id }).from(seasonsTable)
      .where(and(eq(seasonsTable.id, seasonId), eq(seasonsTable.contentItemId, contentItemId)));
    if (!season) {
      res.status(400).json({ message: "seasonId must belong to contentItemId" });
      return;
    }
  }

  // Consider both outgoing grants and incoming acquisition coverage.
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
        inArray(contractsTable.direction, ["rights_out", "rights_in"]),
        eq(contractsTable.archived, false),
        or(
          eq(contractsTable.status, "active"),
          eq(contractsTable.status, "in_perpetuity")
        )
      )
    );

  const contractIds = linkedContracts.map((contract) => contract.id);
  const scopedRows = contractIds.length
    ? await db.select({ contractId: contractSeasonsTable.contractId, seasonId: contractSeasonsTable.seasonId })
      .from(contractSeasonsTable).where(inArray(contractSeasonsTable.contractId, contractIds))
    : [];
  const seasonScopes = new Map<string, string[]>();
  for (const row of scopedRows) {
    seasonScopes.set(row.contractId, [...(seasonScopes.get(row.contractId) ?? []), row.seasonId]);
  }

  // A title-level contract applies to every season. A season-scoped contract
  // applies only to its explicitly selected seasons.
  const scopeAndDateMatches = linkedContracts.filter((c) => {
    const scope = seasonScopes.get(c.id);
    // A whole-title query includes every season, so any scoped grant matters.
    // A season query excludes grants scoped only to different seasons.
    if (scope?.length && seasonId && !scope.includes(seasonId)) return false;
    let dateMatch = true;
    if (c.endType === "date" && c.endDate) {
      dateMatch = checkDate <= new Date(c.endDate);
    }
    if (c.startDate) {
      dateMatch = dateMatch && checkDate >= new Date(c.startDate);
    }

    return dateMatch;
  });

  // Rights Out conflicts use overlap. Rights In acquisition coverage is
  // directional: the inbound grant must contain the entire requested scope.
  const rightsOutMatches = scopeAndDateMatches.filter((c) =>
    c.direction === "rights_out" &&
    territoriesOverlap(territory, c.territories as string[], c.otherTerritories) &&
    (c.distributionTypes as string[]).some((value) =>
      distributionTypesIntersect(distributionType, value)));
  const acquisitionMatches = scopeAndDateMatches.filter((c) =>
    c.direction === "rights_in" &&
    territoriesCover(territory, c.territories as string[], c.otherTerritories) &&
    (c.distributionTypes as string[]).some((value) =>
      distributionTypeContains(value, distributionType)));
  const matchingContracts = [...rightsOutMatches, ...acquisitionMatches];
  // Rightsly must never approve an outbound license without evidence that TBN
  // acquired the requested rights, including when no Rights In grant exists.
  const acquisitionRequired = true;
  const acquisitionCovered = acquisitionMatches.length > 0;
  const acquisitionWarning = acquisitionRequired && !acquisitionCovered
    ? `No active Rights In acquisition coverage matches ${territory} / ${distributionType} on ${date}`
    : undefined;

  const conflicts = rightsOutMatches
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
    seasonIds: seasonScopes.get(c.id) ?? [],
  }));

  const candidateIsAvailable = (candidateTerritory: string, candidateDistribution: string) =>
    !linkedContracts.some((contract) => {
      if (contract.direction !== "rights_out" || contract.rightsOutExclusivity !== "exclusive") return false;
      const scope = seasonScopes.get(contract.id);
      if (scope?.length && seasonId && !scope.includes(seasonId)) return false;
      const dateMatches =
        (!contract.startDate || checkDate >= new Date(contract.startDate)) &&
        (contract.endType !== "date" || !contract.endDate || checkDate <= new Date(contract.endDate));
      return dateMatches &&
        territoriesOverlap(candidateTerritory, contract.territories as string[], contract.otherTerritories) &&
        (contract.distributionTypes as string[]).some((value) =>
          distributionTypesIntersect(candidateDistribution, value));
    });

  res.json({
    available: conflicts.length === 0 && !acquisitionWarning,
    conflicts,
    grants,
    acquisition: {
      required: acquisitionRequired,
      covered: acquisitionCovered,
      warning: acquisitionWarning ?? null,
    },
    // Suggestions only exclude scopes already covered by a matching active
    // grant. They are deliberately advisory: "Other" territory and bespoke
    // distribution wording cannot be inferred safely.
    suggestions: {
      availableTerritories: conflicts.length === 0
        ? []
        : TERRITORIES.filter((candidate) =>
            candidate !== "Global" && candidate !== territory &&
            candidateIsAvailable(candidate, distributionType)),
      availableDistributionTypes: conflicts.length === 0
        ? []
        : DISTRIBUTION_TYPES.filter((candidate) =>
            candidate !== distributionType && candidateIsAvailable(territory, candidate)),
    },
  });
});

export default router;
