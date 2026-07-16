import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq, ilike, count } from "drizzle-orm";
import { authenticateToken, requireRole } from "../lib/auth";
import { logAudit } from "../lib/audit";

const router = Router();
router.use(authenticateToken, requireRole("admin"));

// GET /api/users
router.get("/", async (req, res) => {
  const page = parseInt(req.query.page as string) || 1;
  const pageSize = parseInt(req.query.pageSize as string) || 20;

  const [users, [{ value: total }]] = await Promise.all([
    db
      .select({
        id: usersTable.id,
        email: usersTable.email,
        name: usersTable.name,
        role: usersTable.role,
        isActive: usersTable.isActive,
        createdAt: usersTable.createdAt,
        lastLogin: usersTable.lastLogin,
      })
      .from(usersTable)
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ value: count() }).from(usersTable),
  ]);

  res.json({ data: users, total: Number(total), page, pageSize });
});

// POST /api/users
router.post("/", async (req, res) => {
  const { email, name, role, password } = req.body;

  if (!email || !name || !role || !password) {
    res.status(400).json({ message: "email, name, role, and password are required" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const id = crypto.randomUUID();

  const [user] = await db
    .insert(usersTable)
    .values({ id, email: email.toLowerCase().trim(), name, role, passwordHash, isActive: true })
    .returning({
      id: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      role: usersTable.role,
      isActive: usersTable.isActive,
      createdAt: usersTable.createdAt,
      lastLogin: usersTable.lastLogin,
    });

  await logAudit({ user: req.user, action: "create", entityType: "user", entityId: id, after: { email, name, role } });
  res.status(201).json(user);
});

// GET /api/users/:id
router.get("/:id", async (req, res) => {
  const [user] = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      role: usersTable.role,
      isActive: usersTable.isActive,
      createdAt: usersTable.createdAt,
      lastLogin: usersTable.lastLogin,
    })
    .from(usersTable)
    .where(eq(usersTable.id, req.params.id));

  if (!user) {
    res.status(404).json({ message: "User not found" });
    return;
  }
  res.json(user);
});

// PUT /api/users/:id
router.put("/:id", async (req, res) => {
  const { name, role, isActive, password } = req.body;
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (name !== undefined) updates.name = name;
  if (role !== undefined) updates.role = role;
  if (isActive !== undefined) updates.isActive = isActive;
  if (password) updates.passwordHash = await bcrypt.hash(password, 12);

  const [user] = await db
    .update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, req.params.id))
    .returning({
      id: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      role: usersTable.role,
      isActive: usersTable.isActive,
      createdAt: usersTable.createdAt,
      lastLogin: usersTable.lastLogin,
    });

  if (!user) {
    res.status(404).json({ message: "User not found" });
    return;
  }

  await logAudit({ user: req.user, action: "update", entityType: "user", entityId: req.params.id, after: updates });
  res.json(user);
});

// DELETE /api/users/:id
router.delete("/:id", async (req, res) => {
  await db.delete(usersTable).where(eq(usersTable.id, req.params.id));
  await logAudit({ user: req.user, action: "delete", entityType: "user", entityId: req.params.id });
  res.json({ message: "User deleted" });
});

export default router;
