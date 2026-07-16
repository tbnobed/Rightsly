import { Router } from "express";
import { db } from "@workspace/db";
import { auditLogsTable } from "@workspace/db";
import { eq, and, gte, lte, count } from "drizzle-orm";
import { authenticateToken, requireRole } from "../lib/auth";

const router = Router();
router.use(authenticateToken, requireRole("admin"));

// GET /api/audit-logs
router.get("/", async (req, res) => {
  const page = parseInt(req.query.page as string) || 1;
  const pageSize = parseInt(req.query.pageSize as string) || 50;
  const userId = req.query.userId as string | undefined;
  const entityType = req.query.entityType as string | undefined;
  const action = req.query.action as string | undefined;
  const from = req.query.from as string | undefined;
  const to = req.query.to as string | undefined;

  const conditions: any[] = [];
  if (userId) conditions.push(eq(auditLogsTable.userId, userId));
  if (entityType) conditions.push(eq(auditLogsTable.entityType, entityType));
  if (action) conditions.push(eq(auditLogsTable.action, action as any));
  if (from) conditions.push(gte(auditLogsTable.timestamp, new Date(from)));
  if (to) conditions.push(lte(auditLogsTable.timestamp, new Date(to + "T23:59:59Z")));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [logs, [{ value: total }]] = await Promise.all([
    db
      .select()
      .from(auditLogsTable)
      .where(where)
      .orderBy(auditLogsTable.timestamp)
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ value: count() }).from(auditLogsTable).where(where),
  ]);

  res.json({ data: logs.reverse(), total: Number(total), page, pageSize });
});

export default router;
