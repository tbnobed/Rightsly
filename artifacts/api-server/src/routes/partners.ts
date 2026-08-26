import { Router } from "express";
import { db } from "@workspace/db";
import { partnersTable, contractsTable } from "@workspace/db";
import { eq, ilike, and, count, sql, asc } from "drizzle-orm";
import { authenticateToken, requireRole } from "../lib/auth";
import { logAudit } from "../lib/audit";
import { routeParam } from "../lib/validation";

const router = Router();
router.use(authenticateToken);

// GET /api/partners
router.get("/", async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 20));
  const search = req.query.search as string | undefined;
  const type = req.query.type as string | undefined;
  const allowedSorts = new Set(["name", "type", "website", "contractCount", "updatedAt"]);
  const sortBy = allowedSorts.has(req.query.sortBy as string) ? req.query.sortBy as string : "name";
  const sortDirection = req.query.sortDirection === "desc" ? "desc" : "asc";
  const contractCount = count(contractsTable.id).mapWith(Number);
  const sortColumn = {
    name: partnersTable.name,
    type: partnersTable.type,
    website: partnersTable.website,
    contractCount,
    updatedAt: partnersTable.updatedAt,
  }[sortBy]!;
  const primaryOrder = sortDirection === "desc"
    ? sql`${sortColumn} DESC NULLS LAST`
    : sql`${sortColumn} ASC NULLS LAST`;

  const where = and(
    search ? ilike(partnersTable.name, `%${search}%`) : undefined,
    type ? eq(partnersTable.type, type as "Licensor" | "Licensee" | "Both") : undefined,
  );

  const [partners, [{ value: total }]] = await Promise.all([
    db
      .select({
        id: partnersTable.id,
        name: partnersTable.name,
        type: partnersTable.type,
        website: partnersTable.website,
        notes: partnersTable.notes,
        createdAt: partnersTable.createdAt,
        updatedAt: partnersTable.updatedAt,
        contractCount,
      })
      .from(partnersTable)
      .leftJoin(
        contractsTable,
        and(
          eq(contractsTable.partnerId, partnersTable.id),
          eq(contractsTable.status, "active"),
          eq(contractsTable.archived, false),
          sql`(${contractsTable.endType} <> 'date' OR ${contractsTable.endDate} >= current_date)`,
        ),
      )
      .where(where)
      .groupBy(partnersTable.id)
      .limit(pageSize)
      .offset((page - 1) * pageSize)
      .orderBy(primaryOrder, asc(partnersTable.name), asc(partnersTable.id)),
    db.select({ value: count() }).from(partnersTable).where(where),
  ]);

  res.json({ data: partners, total: Number(total), page, pageSize });
});

// POST /api/partners
router.post("/", requireRole("admin", "legal"), async (req, res) => {
  const { name, type, website, notes } = req.body;
  if (!name || !type) {
    res.status(400).json({ message: "name and type are required" });
    return;
  }

  const id = crypto.randomUUID();
  const [partner] = await db
    .insert(partnersTable)
    .values({ id, name, type, website: website || null, notes: notes || null })
    .returning();

  await logAudit({ user: req.user, action: "create", entityType: "partner", entityId: id, after: { name, type } });
  res.status(201).json({ ...partner, contractCount: 0 });
});

// GET /api/partners/:id
router.get("/:id", async (req, res) => {
  const id = routeParam(req.params.id);
  const [partner] = await db
    .select({
      id: partnersTable.id,
      name: partnersTable.name,
      type: partnersTable.type,
      website: partnersTable.website,
      notes: partnersTable.notes,
      createdAt: partnersTable.createdAt,
      updatedAt: partnersTable.updatedAt,
      contractCount: count(contractsTable.id).mapWith(Number),
    })
    .from(partnersTable)
    .leftJoin(
      contractsTable,
      and(
        eq(contractsTable.partnerId, partnersTable.id),
        eq(contractsTable.status, "active"),
        eq(contractsTable.archived, false),
        sql`(${contractsTable.endType} <> 'date' OR ${contractsTable.endDate} >= current_date)`,
      ),
    )
    .where(eq(partnersTable.id, id))
    .groupBy(partnersTable.id);

  if (!partner) {
    res.status(404).json({ message: "Partner not found" });
    return;
  }
  res.json(partner);
});

// PUT /api/partners/:id
router.put("/:id", requireRole("admin", "legal"), async (req, res) => {
  const { name, type, website, notes } = req.body;
  const id = routeParam(req.params.id);
  const [before] = await db.select().from(partnersTable).where(eq(partnersTable.id, id));
  if (!before) { res.status(404).json({ message: "Partner not found" }); return; }

  const [partner] = await db
    .update(partnersTable)
    .set({ name, type, website: website || null, notes: notes || null, updatedAt: new Date() })
    .where(eq(partnersTable.id, id))
    .returning();

  await logAudit({ user: req.user, action: "update", entityType: "partner", entityId: id,
    before: { name: before.name, type: before.type, website: before.website, notes: before.notes },
    after: { name: partner.name, type: partner.type, website: partner.website, notes: partner.notes } });
  const [{ contractCount }] = await db.select({
    contractCount: count(contractsTable.id).mapWith(Number),
  }).from(contractsTable).where(and(
    eq(contractsTable.partnerId, id),
    eq(contractsTable.status, "active"),
    eq(contractsTable.archived, false),
    sql`(${contractsTable.endType} <> 'date' OR ${contractsTable.endDate} >= current_date)`,
  ));
  res.json({ ...partner, contractCount });
});

// DELETE /api/partners/:id
router.delete("/:id", requireRole("admin"), async (req, res) => {
  const id = routeParam(req.params.id);
  await db.delete(partnersTable).where(eq(partnersTable.id, id));
  await logAudit({ user: req.user, action: "delete", entityType: "partner", entityId: id });
  res.json({ message: "Partner deleted" });
});

export default router;
