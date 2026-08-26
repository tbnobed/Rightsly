import { Router } from "express";
import { and, asc, count, desc, eq, ilike, or } from "drizzle-orm";
import {
  CreateContactBody,
  CreateContactResponse,
  DeleteContactParams,
  DeleteContactResponse,
  GetContactParams,
  GetContactResponse,
  ListContactsQueryParams,
  ListContactsResponse,
  UpdateContactBody,
  UpdateContactParams,
  UpdateContactResponse,
} from "@workspace/api-zod";
import { contactsTable, db } from "@workspace/db";
import { authenticateToken, requireRole } from "../lib/auth";
import { logAudit } from "../lib/audit";

const router = Router();
router.use(authenticateToken);

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeOptional(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function normalizeInput(input: {
  name?: string;
  company?: string | null;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
}): {
  name?: string;
  company?: string | null;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
} {
  const normalized = { ...input };
  if (input.name !== undefined) normalized.name = input.name.trim();
  for (const field of ["company", "title", "email", "phone", "notes"] as const) {
    if (input[field] !== undefined) normalized[field] = normalizeOptional(input[field]);
  }
  return normalized;
}

function hasValidEmail(email: string | null | undefined): boolean {
  return email == null || emailPattern.test(email);
}

router.get("/", async (req, res): Promise<void> => {
  const query = ListContactsQueryParams.safeParse(req.query);
  if (!query.success) {
    req.log.warn({ errors: query.error.message }, "Invalid contact list query");
    res.status(400).json({ message: query.error.message });
    return;
  }
  const { page, pageSize, search, sortBy, sortDirection } = query.data;
  const where = search
    ? or(
        ilike(contactsTable.name, `%${search}%`),
        ilike(contactsTable.company, `%${search}%`),
        ilike(contactsTable.email, `%${search}%`),
      )
    : undefined;
  const sortColumn = {
    name: contactsTable.name,
    company: contactsTable.company,
    title: contactsTable.title,
    updatedAt: contactsTable.updatedAt,
  }[sortBy];
  const order = sortDirection === "desc" ? desc(sortColumn) : asc(sortColumn);
  const [data, [{ value: total }]] = await Promise.all([
    db.select().from(contactsTable).where(where).orderBy(order, asc(contactsTable.name), asc(contactsTable.id))
      .limit(pageSize).offset((page - 1) * pageSize),
    db.select({ value: count() }).from(contactsTable).where(where),
  ]);
  res.json(ListContactsResponse.parse({ data, total: Number(total), page, pageSize }));
});

router.post("/", requireRole("admin", "legal"), async (req, res): Promise<void> => {
  const parsed = CreateContactBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Invalid contact create body");
    res.status(400).json({ message: parsed.error.message });
    return;
  }
  const data = normalizeInput(parsed.data);
  if (!data.name || !hasValidEmail(data.email)) {
    res.status(400).json({ message: data.name ? "email must be valid" : "name is required" });
    return;
  }
  const [contact] = await db.insert(contactsTable).values({
    id: crypto.randomUUID(),
    name: data.name,
    company: data.company ?? null,
    title: data.title ?? null,
    email: data.email ?? null,
    phone: data.phone ?? null,
    notes: data.notes ?? null,
  }).returning();
  await logAudit({
    user: req.user, action: "create", entityType: "contact", entityId: contact.id,
    after: { name: contact.name, company: contact.company, email: contact.email },
  });
  res.status(201).json(CreateContactResponse.parse(contact));
});

router.get("/:id", async (req, res): Promise<void> => {
  const params = GetContactParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: params.error.message });
    return;
  }
  const [contact] = await db.select().from(contactsTable).where(eq(contactsTable.id, params.data.id));
  if (!contact) {
    res.status(404).json({ message: "Contact not found" });
    return;
  }
  res.json(GetContactResponse.parse(contact));
});

router.patch("/:id", requireRole("admin", "legal"), async (req, res): Promise<void> => {
  const params = UpdateContactParams.safeParse(req.params);
  const parsed = UpdateContactBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ message: params.error.message });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.message });
    return;
  }
  const data = normalizeInput(parsed.data);
  if (Object.keys(data).length === 0 || (data.name !== undefined && !data.name) || !hasValidEmail(data.email)) {
    res.status(400).json({ message: !hasValidEmail(data.email) ? "email must be valid" : "Contact update is invalid" });
    return;
  }
  const [before] = await db.select().from(contactsTable).where(eq(contactsTable.id, params.data.id));
  if (!before) {
    res.status(404).json({ message: "Contact not found" });
    return;
  }
  const [contact] = await db.update(contactsTable).set({ ...data, updatedAt: new Date() })
    .where(eq(contactsTable.id, params.data.id)).returning();
  await logAudit({
    user: req.user, action: "update", entityType: "contact", entityId: contact.id,
    before: { name: before.name, company: before.company, title: before.title, email: before.email },
    after: { name: contact.name, company: contact.company, title: contact.title, email: contact.email },
  });
  res.json(UpdateContactResponse.parse(contact));
});

router.delete("/:id", requireRole("admin"), async (req, res): Promise<void> => {
  const params = DeleteContactParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: params.error.message });
    return;
  }
  const [contact] = await db.delete(contactsTable).where(eq(contactsTable.id, params.data.id)).returning();
  if (!contact) {
    res.status(404).json({ message: "Contact not found" });
    return;
  }
  await logAudit({
    user: req.user, action: "delete", entityType: "contact", entityId: contact.id,
    before: { name: contact.name, company: contact.company, email: contact.email },
  });
  res.json(DeleteContactResponse.parse({ message: "Contact deleted" }));
});

export default router;