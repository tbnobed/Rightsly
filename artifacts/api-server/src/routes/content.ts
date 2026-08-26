import { Router } from "express";
import { db } from "@workspace/db";
import { contentItemsTable, seasonsTable, contractContentTable, contractSeasonsTable, contractsTable, partnersTable } from "@workspace/db";
import { eq, ilike, and, count, sql, desc, asc, inArray } from "drizzle-orm";
import { authenticateToken, requireRole } from "../lib/auth";
import { logAudit } from "../lib/audit";
import { routeParam, validateContentYear } from "../lib/validation";
import { normalizeContentType } from "../lib/rightsValidation";

const router = Router();
router.use(authenticateToken);

// GET /api/content
router.get("/", async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 20));
  const search = req.query.search as string | undefined;
  const type = req.query.type as string | undefined;
  const normalizedType = type === undefined ? undefined : normalizeContentType(type);
  if (type !== undefined && !normalizedType) {
    res.status(400).json({ message: `Unrecognized content type: ${type}` });
    return;
  }
  const allowedSorts = new Set(["title", "type", "year", "contractCount", "updatedAt"]);
  const sortBy = allowedSorts.has(req.query.sortBy as string) ? req.query.sortBy as string : "title";
  const sortDirection = req.query.sortDirection === "desc" ? "desc" : "asc";
  const contractCount = count(contractsTable.id).mapWith(Number);
  const sortColumn = {
    title: contentItemsTable.title,
    type: contentItemsTable.type,
    year: contentItemsTable.year,
    contractCount,
    updatedAt: contentItemsTable.updatedAt,
  }[sortBy]!;
  const primaryOrder = sortDirection === "desc"
    ? sql`${sortColumn} DESC NULLS LAST`
    : sql`${sortColumn} ASC NULLS LAST`;

  const where = and(
    search ? ilike(contentItemsTable.title, `%${search}%`) : undefined,
    normalizedType ? eq(contentItemsTable.type, normalizedType) : undefined,
  );

  const [items, [{ value: total }]] = await Promise.all([
    db
      .select({
        id: contentItemsTable.id,
        type: contentItemsTable.type,
        title: contentItemsTable.title,
        description: contentItemsTable.description,
        year: contentItemsTable.year,
        hasCleans: contentItemsTable.hasCleans,
        hasCaptions: contentItemsTable.hasCaptions,
        createdAt: contentItemsTable.createdAt,
        updatedAt: contentItemsTable.updatedAt,
        contractCount,
      })
      .from(contentItemsTable)
      .leftJoin(contractContentTable, eq(contractContentTable.contentItemId, contentItemsTable.id))
      .leftJoin(
        contractsTable,
        and(
          eq(contractsTable.id, contractContentTable.contractId),
          eq(contractsTable.status, "active"),
          eq(contractsTable.archived, false),
          sql`(${contractsTable.endType} <> 'date' OR ${contractsTable.endDate} >= current_date)`,
        ),
      )
      .where(where)
      .groupBy(contentItemsTable.id)
      .orderBy(primaryOrder, asc(contentItemsTable.title), asc(contentItemsTable.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ value: count() }).from(contentItemsTable).where(where),
  ]);

  // Load seasons for TV series
  const ids = items.map((i) => i.id);
  const seasons = ids.length
    ? await db.select().from(seasonsTable).where(
        sql`${seasonsTable.contentItemId} = ANY(${sql`ARRAY[${sql.join(ids.map(id => sql`${id}`), sql`, `)}]`})`
      )
    : [];

  const seasonsByItem = seasons.reduce((acc, s) => {
    if (!acc[s.contentItemId]) acc[s.contentItemId] = [];
    acc[s.contentItemId].push(s);
    return acc;
  }, {} as Record<string, typeof seasons>);

  res.json({
    data: items.map((item) => ({ ...item, seasons: seasonsByItem[item.id] || [] })),
    total: Number(total),
    page,
    pageSize,
  });
});

// POST /api/content
router.post("/", requireRole("admin", "legal"), async (req, res) => {
  const { type, title, description, year, seasons, hasCleans, hasCaptions } = req.body;

  if (!type || !title) {
    res.status(400).json({ message: "type and title are required" });
    return;
  }
  const normalizedType = normalizeContentType(type);
  if (!normalizedType) {
    res.status(400).json({ message: `Unrecognized content type: ${type}` });
    return;
  }
  const yearError = validateContentYear(year);
  if (yearError) { res.status(400).json({ message: yearError }); return; }

  const id = crypto.randomUUID();
  const [item] = await db
    .insert(contentItemsTable)
    .values({ id, type: normalizedType, title, description: description || null, year: year || null, hasCleans: !!hasCleans, hasCaptions: !!hasCaptions })
    .returning();

  let createdSeasons: any[] = [];
  if (seasons?.length && normalizedType === "TVSeries") {
    createdSeasons = await db
      .insert(seasonsTable)
      .values(
        seasons.map((s: any) => ({
          id: crypto.randomUUID(),
          contentItemId: id,
          seasonNumber: s.seasonNumber,
          title: s.title || null,
          year: s.year || null,
          episodeCount: s.episodeCount || null,
        }))
      )
      .returning();
  }

  await logAudit({ user: req.user, action: "create", entityType: "content", entityId: id, after: { type: normalizedType, title } });
  res.status(201).json({ ...item, seasons: createdSeasons, contractCount: 0 });
});

// GET /api/content/:id
router.get("/:id", async (req, res) => {
  const id = routeParam(req.params.id);
  const [item] = await db
    .select()
    .from(contentItemsTable)
    .where(eq(contentItemsTable.id, id));

  if (!item) {
    res.status(404).json({ message: "Content item not found" });
    return;
  }

  const [seasons, [{ value: contractCount }]] = await Promise.all([
    db.select().from(seasonsTable).where(eq(seasonsTable.contentItemId, id)).orderBy(seasonsTable.seasonNumber),
    db.select({ value: count() }).from(contractContentTable).where(eq(contractContentTable.contentItemId, id)),
  ]);

  res.json({ ...item, seasons, contractCount: Number(contractCount) });
});

// PUT /api/content/:id
router.put("/:id", requireRole("admin", "legal"), async (req, res) => {
  const id = routeParam(req.params.id);
  const { type, title, description, year, seasons, hasCleans, hasCaptions } = req.body;
  const normalizedType = normalizeContentType(type);
  if (!normalizedType) {
    res.status(400).json({ message: `Unrecognized content type: ${type}` });
    return;
  }
  const yearError = validateContentYear(year);
  if (yearError) { res.status(400).json({ message: yearError }); return; }
  try {
    const result = await db.transaction(async (tx) => {
      let currentSeasonRows: { id: string }[] = [];
      if (seasons !== undefined) {
        // Serialize contract scope inserts with season removal. Together with
        // the restrictive FK, no concurrent edit can cascade away scope.
        await tx.execute(sql`LOCK TABLE seasons, contract_seasons IN SHARE ROW EXCLUSIVE MODE`);
        currentSeasonRows = await tx.select({ id: seasonsTable.id }).from(seasonsTable)
          .where(eq(seasonsTable.contentItemId, id));
        const currentIds = new Set(currentSeasonRows.map((season) => season.id));
        const keptIds = new Set<string>(
          seasons.flatMap((season: { id?: unknown }) =>
            typeof season.id === "string" && currentIds.has(season.id) ? [season.id] : []
          ),
        );
        const removedIds = currentSeasonRows.filter((season) => !keptIds.has(season.id)).map((season) => season.id);
        if (removedIds.length) {
          const [reference] = await tx.select({ seasonId: contractSeasonsTable.seasonId })
            .from(contractSeasonsTable)
            .where(inArray(contractSeasonsTable.seasonId, removedIds))
            .limit(1);
          if (reference) return { error: "referenced" as const };
        }
      }

      const [item] = await tx.update(contentItemsTable).set({
        type: normalizedType,
        title,
        description: description || null,
        year: year || null,
        ...(hasCleans !== undefined ? { hasCleans: !!hasCleans } : {}),
        ...(hasCaptions !== undefined ? { hasCaptions: !!hasCaptions } : {}),
        updatedAt: new Date(),
      }).where(eq(contentItemsTable.id, id)).returning();
      if (!item) return { error: "not_found" as const };

      if (seasons !== undefined) {
        const currentIds = new Set(currentSeasonRows.map((season) => season.id));
        const keptIds = new Set<string>();
        for (const season of seasons) {
          const seasonId = typeof season.id === "string" && currentIds.has(season.id) ? season.id : crypto.randomUUID();
          keptIds.add(seasonId);
          const values = {
            contentItemId: id,
            seasonNumber: season.seasonNumber,
            title: season.title || null,
            year: season.year || null,
            episodeCount: season.episodeCount || null,
          };
          if (currentIds.has(seasonId)) {
            await tx.update(seasonsTable).set(values).where(eq(seasonsTable.id, seasonId));
          } else {
            await tx.insert(seasonsTable).values({ id: seasonId, ...values });
          }
        }
        const removedIds = currentSeasonRows.filter((season) => !keptIds.has(season.id)).map((season) => season.id);
        if (removedIds.length) {
          await tx.delete(seasonsTable).where(inArray(seasonsTable.id, removedIds));
        }
      }

      const [updatedSeasons, [{ value: contractCount }]] = await Promise.all([
        tx.select().from(seasonsTable).where(eq(seasonsTable.contentItemId, id)).orderBy(seasonsTable.seasonNumber),
        tx.select({ value: count() }).from(contractContentTable).where(eq(contractContentTable.contentItemId, id)),
      ]);
      return { item, updatedSeasons, contractCount: Number(contractCount) };
    });
    if ("error" in result) {
      res.status(result.error === "not_found" ? 404 : 409).json({
        message: result.error === "not_found"
          ? "Content item not found"
          : "A season linked to a contract cannot be deleted",
      });
      return;
    }

    await logAudit({ user: req.user, action: "update", entityType: "content", entityId: id });
    res.json({ ...result.item, seasons: result.updatedSeasons, contractCount: result.contractCount });
  } catch (error) {
    if ((error as { code?: string }).code === "23503") {
      res.status(409).json({ message: "A season linked to a contract cannot be deleted" });
      return;
    }
    throw error;
  }
});

// DELETE /api/content/:id
router.delete("/:id", requireRole("admin"), async (req, res) => {
  const id = routeParam(req.params.id);
  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`LOCK TABLE content_items, contract_content IN SHARE ROW EXCLUSIVE MODE`);
      const [reference] = await tx.select({ contractId: contractContentTable.contractId })
        .from(contractContentTable)
        .where(eq(contractContentTable.contentItemId, id))
        .limit(1);
      if (reference) return "referenced" as const;
      const [deleted] = await tx.delete(contentItemsTable)
        .where(eq(contentItemsTable.id, id))
        .returning({ id: contentItemsTable.id });
      return deleted ? "deleted" as const : "not_found" as const;
    });
    if (result !== "deleted") {
      res.status(result === "referenced" ? 409 : 404).json({
        message: result === "referenced"
          ? "Content linked to a contract cannot be deleted"
          : "Content item not found",
      });
      return;
    }
    await logAudit({ user: req.user, action: "delete", entityType: "content", entityId: id });
    res.json({ message: "Content item deleted" });
  } catch (error) {
    if ((error as { code?: string }).code === "23503") {
      res.status(409).json({ message: "Content linked to a contract cannot be deleted" });
      return;
    }
    throw error;
  }
});

// GET /api/content/:id/contracts
router.get("/:id/contracts", async (req, res) => {
  const id = routeParam(req.params.id);
  const today = new Date().toISOString().split("T")[0];
  const salesVisibility = req.user?.role === "sales"
    ? and(
        eq(contractsTable.status, "active"),
        eq(contractsTable.archived, false),
        sql`(${contractsTable.endType} <> 'date' OR ${contractsTable.endDate} >= ${today})`,
      )
    : undefined;
  const contracts = await db
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
      contentCount: sql<number>`1`.mapWith(Number),
      createdAt: contractsTable.createdAt,
    })
    .from(contractContentTable)
    .innerJoin(contractsTable, eq(contractContentTable.contractId, contractsTable.id))
    .leftJoin(partnersTable, eq(contractsTable.partnerId, partnersTable.id))
    .where(and(eq(contractContentTable.contentItemId, id), salesVisibility))
    .orderBy(desc(contractsTable.createdAt));

  const canViewFinancials = req.user?.role === "admin" || req.user?.role === "finance";
  res.json(contracts.map((contract) => ({
    ...contract,
    royaltyType: canViewFinancials ? contract.royaltyType : null,
  })));
});

export default router;
