import { Router } from "express";
import { db } from "@workspace/db";
import { contentItemsTable, seasonsTable, contractContentTable, contractsTable, partnersTable } from "@workspace/db";
import { eq, ilike, and, count, sql, desc } from "drizzle-orm";
import { authenticateToken, requireRole } from "../lib/auth";
import { logAudit } from "../lib/audit";

const router = Router();
router.use(authenticateToken);

// GET /api/content
router.get("/", async (req, res) => {
  const page = parseInt(req.query.page as string) || 1;
  const pageSize = parseInt(req.query.pageSize as string) || 20;
  const search = req.query.search as string | undefined;
  const type = req.query.type as string | undefined;

  const where = and(
    search ? ilike(contentItemsTable.title, `%${search}%`) : undefined,
    type ? eq(contentItemsTable.type, type as any) : undefined,
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
        contractCount: sql<number>`(select count(*) from contract_content where contract_content.content_item_id = ${contentItemsTable.id})`.mapWith(Number),
      })
      .from(contentItemsTable)
      .where(where)
      .orderBy(contentItemsTable.title)
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

  const id = crypto.randomUUID();
  const [item] = await db
    .insert(contentItemsTable)
    .values({ id, type, title, description: description || null, year: year || null, hasCleans: !!hasCleans, hasCaptions: !!hasCaptions })
    .returning();

  let createdSeasons: any[] = [];
  if (seasons?.length && type === "TVSeries") {
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

  await logAudit({ user: req.user, action: "create", entityType: "content", entityId: id, after: { type, title } });
  res.status(201).json({ ...item, seasons: createdSeasons, contractCount: 0 });
});

// GET /api/content/:id
router.get("/:id", async (req, res) => {
  const [item] = await db
    .select()
    .from(contentItemsTable)
    .where(eq(contentItemsTable.id, req.params.id));

  if (!item) {
    res.status(404).json({ message: "Content item not found" });
    return;
  }

  const [seasons, [{ value: contractCount }]] = await Promise.all([
    db.select().from(seasonsTable).where(eq(seasonsTable.contentItemId, req.params.id)).orderBy(seasonsTable.seasonNumber),
    db.select({ value: count() }).from(contractContentTable).where(eq(contractContentTable.contentItemId, req.params.id)),
  ]);

  res.json({ ...item, seasons, contractCount: Number(contractCount) });
});

// PUT /api/content/:id
router.put("/:id", requireRole("admin", "legal"), async (req, res) => {
  const { type, title, description, year, seasons, hasCleans, hasCaptions } = req.body;

  const [item] = await db
    .update(contentItemsTable)
    .set({
      type,
      title,
      description: description || null,
      year: year || null,
      ...(hasCleans !== undefined ? { hasCleans: !!hasCleans } : {}),
      ...(hasCaptions !== undefined ? { hasCaptions: !!hasCaptions } : {}),
      updatedAt: new Date(),
    })
    .where(eq(contentItemsTable.id, req.params.id))
    .returning();

  if (!item) {
    res.status(404).json({ message: "Content item not found" });
    return;
  }

  if (seasons !== undefined) {
    await db.delete(seasonsTable).where(eq(seasonsTable.contentItemId, req.params.id));
    if (seasons.length) {
      await db.insert(seasonsTable).values(
        seasons.map((s: any) => ({
          id: crypto.randomUUID(),
          contentItemId: req.params.id,
          seasonNumber: s.seasonNumber,
          title: s.title || null,
          year: s.year || null,
          episodeCount: s.episodeCount || null,
        }))
      );
    }
  }

  const [updatedSeasons, [{ value: contractCount }]] = await Promise.all([
    db.select().from(seasonsTable).where(eq(seasonsTable.contentItemId, req.params.id)).orderBy(seasonsTable.seasonNumber),
    db.select({ value: count() }).from(contractContentTable).where(eq(contractContentTable.contentItemId, req.params.id)),
  ]);

  await logAudit({ user: req.user, action: "update", entityType: "content", entityId: req.params.id });
  res.json({ ...item, seasons: updatedSeasons, contractCount: Number(contractCount) });
});

// DELETE /api/content/:id
router.delete("/:id", requireRole("admin"), async (req, res) => {
  await db.delete(contentItemsTable).where(eq(contentItemsTable.id, req.params.id));
  await logAudit({ user: req.user, action: "delete", entityType: "content", entityId: req.params.id });
  res.json({ message: "Content item deleted" });
});

// GET /api/content/:id/contracts
router.get("/:id/contracts", async (req, res) => {
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
    .where(eq(contractContentTable.contentItemId, req.params.id))
    .orderBy(desc(contractsTable.createdAt));

  res.json(contracts);
});

export default router;
