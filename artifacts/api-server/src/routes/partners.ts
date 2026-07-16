import { Router } from "express";
import { db } from "@workspace/db";
import { partnersTable, contractsTable } from "@workspace/db";
import { eq, ilike, and, count, sql } from "drizzle-orm";
import { authenticateToken, requireRole } from "../lib/auth";
import { logAudit } from "../lib/audit";

const router = Router();
router.use(authenticateToken);

// GET /api/partners
router.get("/", async (req, res) => {
  const page = parseInt(req.query.page as string) || 1;
  const pageSize = parseInt(req.query.pageSize as string) || 20;
  const search = req.query.search as string | undefined;
  const type = req.query.type as string | undefined;

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
        contractCount: sql<number>`(select count(*) from contracts where contracts.partner_id = ${partnersTable.id})`.mapWith(Number),
      })
      .from(partnersTable)
      .where(where)
      .limit(pageSize)
      .offset((page - 1) * pageSize)
      .orderBy(partnersTable.name),
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
  const [partner] = await db
    .select({
      id: partnersTable.id,
      name: partnersTable.name,
      type: partnersTable.type,
      website: partnersTable.website,
      notes: partnersTable.notes,
      createdAt: partnersTable.createdAt,
      updatedAt: partnersTable.updatedAt,
      contractCount: sql<number>`(select count(*) from contracts where contracts.partner_id = ${partnersTable.id})`.mapWith(Number),
    })
    .from(partnersTable)
    .where(eq(partnersTable.id, req.params.id));

  if (!partner) {
    res.status(404).json({ message: "Partner not found" });
    return;
  }
  res.json(partner);
});

// PUT /api/partners/:id
router.put("/:id", requireRole("admin", "legal"), async (req, res) => {
  const { name, type, website, notes } = req.body;

  const [partner] = await db
    .update(partnersTable)
    .set({ name, type, website: website || null, notes: notes || null, updatedAt: new Date() })
    .where(eq(partnersTable.id, req.params.id))
    .returning();

  if (!partner) {
    res.status(404).json({ message: "Partner not found" });
    return;
  }

  await logAudit({ user: req.user, action: "update", entityType: "partner", entityId: req.params.id });
  res.json({ ...partner, contractCount: 0 });
});

// DELETE /api/partners/:id
router.delete("/:id", requireRole("admin"), async (req, res) => {
  await db.delete(partnersTable).where(eq(partnersTable.id, req.params.id));
  await logAudit({ user: req.user, action: "delete", entityType: "partner", entityId: req.params.id });
  res.json({ message: "Partner deleted" });
});

export default router;
