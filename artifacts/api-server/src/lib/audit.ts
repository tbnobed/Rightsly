import { db } from "@workspace/db";
import { auditLogsTable } from "@workspace/db";
import type { AuthenticatedUser } from "./auth";

type AuditAction = "create" | "update" | "delete" | "status_change" | "login" | "logout";

export async function logAudit(params: {
  user?: AuthenticatedUser | null;
  action: AuditAction;
  entityType: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
}): Promise<void> {
  try {
    const { user, action, entityType, entityId, before, after } = params;
    await db.insert(auditLogsTable).values({
      id: crypto.randomUUID(),
      userId: user?.id ?? null,
      userEmail: user?.email ?? null,
      userName: user?.name ?? null,
      action,
      entityType,
      entityId: entityId ?? null,
      beforeSummary: before ? JSON.stringify(before).slice(0, 1000) : null,
      afterSummary: after ? JSON.stringify(after).slice(0, 1000) : null,
      timestamp: new Date(),
    });
  } catch {
    // Audit logging should never crash the main flow
  }
}
