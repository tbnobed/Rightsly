import { Router } from "express";
import { db } from "@workspace/db";
import {
  contractsTable,
  contractContentTable,
  partnersTable,
  contentItemsTable,
  amendmentsTable,
  contractAttachmentsTable,
  usersTable,
} from "@workspace/db";
import { eq, and, ilike, inArray, sql, count, lte, gte, asc, desc } from "drizzle-orm";
import { authenticateToken, requireRole } from "../lib/auth";
import { logAudit } from "../lib/audit";

const router = Router();
router.use(authenticateToken);

function contractReadGuard(req: any, res: any, next: any) {
  // Sales can only see active contracts
  if (req.user?.role === "sales") {
    req.salesFilter = true;
  }
  next();
}

// GET /api/contracts
router.get("/", contractReadGuard, async (req, res) => {
  const page = parseInt(req.query.page as string) || 1;
  const pageSize = parseInt(req.query.pageSize as string) || 20;
  const direction = req.query.direction as string | undefined;
  const status = req.query.status as string | undefined;
  const partnerId = req.query.partnerId as string | undefined;
  const search = req.query.search as string | undefined;
  const expiringWithinDays = req.query.expiringWithinDays
    ? parseInt(req.query.expiringWithinDays as string)
    : undefined;

  const conditions: any[] = [];
  if (direction) conditions.push(eq(contractsTable.direction, direction as any));
  if (status) conditions.push(eq(contractsTable.status, status as any));
  if (partnerId) conditions.push(eq(contractsTable.partnerId, partnerId));
  if (search) conditions.push(ilike(partnersTable.name, `%${search}%`));
  if (req.salesFilter) conditions.push(eq(contractsTable.status, "active"));
  if (expiringWithinDays) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + expiringWithinDays);
    conditions.push(
      and(
        eq(contractsTable.endType, "date"),
        lte(contractsTable.endDate, cutoff.toISOString().split("T")[0]),
        gte(contractsTable.endDate, new Date().toISOString().split("T")[0])
      )
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [contracts, [{ value: total }]] = await Promise.all([
    db
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
        contentCount: sql<number>`(select count(*) from contract_content where contract_content.contract_id = ${contractsTable.id})`.mapWith(Number),
        createdAt: contractsTable.createdAt,
      })
      .from(contractsTable)
      .leftJoin(partnersTable, eq(contractsTable.partnerId, partnersTable.id))
      .where(where)
      .orderBy(desc(contractsTable.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ value: count() })
      .from(contractsTable)
      .leftJoin(partnersTable, eq(contractsTable.partnerId, partnersTable.id))
      .where(where),
  ]);

  res.json({ data: contracts, total: Number(total), page, pageSize });
});

// POST /api/contracts
router.post("/", requireRole("admin", "legal"), async (req, res) => {
  const {
    direction,
    partnerId,
    licensor,
    licensee,
    status,
    startDate,
    endType,
    endDate,
    territories,
    otherTerritories,
    distributionTypes,
    platform,
    royaltyType,
    royaltyDetails,
    paymentTerms,
    notes,
    websiteLink,
    rightsInDetails,
    rightsOutDetails,
    contentItemIds,
  } = req.body;

  if (!direction || !partnerId || !endType) {
    res.status(400).json({ message: "direction, partnerId, endType are required" });
    return;
  }

  const id = crypto.randomUUID();
  const ri = rightsInDetails || {};
  const ro = rightsOutDetails || {};

  const [contract] = await db
    .insert(contractsTable)
    .values({
      id,
      direction,
      partnerId,
      licensor: licensor || null,
      licensee: licensee || null,
      status: status || "draft",
      startDate: startDate || null,
      endType,
      endDate: endDate || null,
      territories: territories || [],
      otherTerritories: otherTerritories || null,
      distributionTypes: distributionTypes || [],
      platform: platform || null,
      royaltyType: royaltyType || null,
      royaltyDetails: royaltyDetails || null,
      paymentTerms: paymentTerms || null,
      notes: notes || null,
      websiteLink: websiteLink || null,
      // Rights In
      rightsInPlatforms: ri.platforms || null,
      rightsInYoutubeChannel: ri.youtubeChannel || null,
      rightsInSocialPlatforms: ri.socialPlatforms || null,
      rightsInSocialHandle: ri.socialHandle || null,
      rightsInGrantOfRights: ri.grantOfRights || null,
      rightsInExclusivityStartDate: ri.exclusivityStartDate || null,
      rightsInExclusivityEndDate: ri.exclusivityEndDate || null,
      rightsInExclusivitySameAsDuration: ri.exclusivitySameAsDuration || false,
      rightsInMarketingRights: ri.marketingRights || null,
      // Rights Out
      rightsOutAutoRenew: ro.autoRenew || false,
      rightsOutHasAmendment: ro.hasAmendment || false,
      rightsOutExclusivity: ro.exclusivity || null,
      rightsOutReportingFrequency: ro.reportingFrequency || null,
      rightsOutMinPaymentThreshold: ro.minPaymentThreshold?.toString() || null,
      createdBy: req.user!.id,
    })
    .returning();

  // Link content items
  if (contentItemIds?.length) {
    await db.insert(contractContentTable).values(
      contentItemIds.map((cid: string) => ({ contractId: id, contentItemId: cid }))
    );
  }

  await logAudit({ user: req.user, action: "create", entityType: "contract", entityId: id, after: { direction, partnerId, status } });
  res.status(201).json(await getContractById(id));
});

// GET /api/contracts/:id
router.get("/:id", contractReadGuard, async (req, res) => {
  const contract = await getContractById(req.params.id);
  if (!contract) {
    res.status(404).json({ message: "Contract not found" });
    return;
  }
  res.json(contract);
});

// PUT /api/contracts/:id
router.put("/:id", requireRole("admin", "legal"), async (req, res) => {
  const {
    partnerId,
    licensor,
    licensee,
    status,
    startDate,
    endType,
    endDate,
    territories,
    otherTerritories,
    distributionTypes,
    platform,
    royaltyType,
    royaltyDetails,
    paymentTerms,
    notes,
    websiteLink,
    rightsInDetails,
    rightsOutDetails,
    contentItemIds,
  } = req.body;

  const ri = rightsInDetails || {};
  const ro = rightsOutDetails || {};

  const updates: any = { updatedAt: new Date() };
  if (partnerId !== undefined) updates.partnerId = partnerId;
  if (licensor !== undefined) updates.licensor = licensor;
  if (licensee !== undefined) updates.licensee = licensee;
  if (status !== undefined) updates.status = status;
  if (startDate !== undefined) updates.startDate = startDate;
  if (endType !== undefined) updates.endType = endType;
  if (endDate !== undefined) updates.endDate = endDate;
  if (territories !== undefined) updates.territories = territories;
  if (otherTerritories !== undefined) updates.otherTerritories = otherTerritories;
  if (distributionTypes !== undefined) updates.distributionTypes = distributionTypes;
  if (platform !== undefined) updates.platform = platform;
  if (royaltyType !== undefined) updates.royaltyType = royaltyType;
  if (royaltyDetails !== undefined) updates.royaltyDetails = royaltyDetails;
  if (paymentTerms !== undefined) updates.paymentTerms = paymentTerms;
  if (notes !== undefined) updates.notes = notes;
  if (websiteLink !== undefined) updates.websiteLink = websiteLink;

  if (rightsInDetails) {
    if (ri.platforms !== undefined) updates.rightsInPlatforms = ri.platforms;
    if (ri.youtubeChannel !== undefined) updates.rightsInYoutubeChannel = ri.youtubeChannel;
    if (ri.socialPlatforms !== undefined) updates.rightsInSocialPlatforms = ri.socialPlatforms;
    if (ri.socialHandle !== undefined) updates.rightsInSocialHandle = ri.socialHandle;
    if (ri.grantOfRights !== undefined) updates.rightsInGrantOfRights = ri.grantOfRights;
    if (ri.exclusivityStartDate !== undefined) updates.rightsInExclusivityStartDate = ri.exclusivityStartDate;
    if (ri.exclusivityEndDate !== undefined) updates.rightsInExclusivityEndDate = ri.exclusivityEndDate;
    if (ri.exclusivitySameAsDuration !== undefined) updates.rightsInExclusivitySameAsDuration = ri.exclusivitySameAsDuration;
    if (ri.marketingRights !== undefined) updates.rightsInMarketingRights = ri.marketingRights;
  }

  if (rightsOutDetails) {
    if (ro.autoRenew !== undefined) updates.rightsOutAutoRenew = ro.autoRenew;
    if (ro.hasAmendment !== undefined) updates.rightsOutHasAmendment = ro.hasAmendment;
    if (ro.exclusivity !== undefined) updates.rightsOutExclusivity = ro.exclusivity;
    if (ro.reportingFrequency !== undefined) updates.rightsOutReportingFrequency = ro.reportingFrequency;
    if (ro.minPaymentThreshold !== undefined) updates.rightsOutMinPaymentThreshold = ro.minPaymentThreshold?.toString();
  }

  await db.update(contractsTable).set(updates).where(eq(contractsTable.id, req.params.id));

  if (contentItemIds !== undefined) {
    await db.delete(contractContentTable).where(eq(contractContentTable.contractId, req.params.id));
    if (contentItemIds.length) {
      await db.insert(contractContentTable).values(
        contentItemIds.map((cid: string) => ({ contractId: req.params.id, contentItemId: cid }))
      );
    }
  }

  const prevStatus = req.body._prevStatus;
  const action = status && status !== prevStatus ? "status_change" : "update";
  await logAudit({ user: req.user, action, entityType: "contract", entityId: req.params.id, after: updates });

  res.json(await getContractById(req.params.id));
});

// DELETE /api/contracts/:id
router.delete("/:id", requireRole("admin"), async (req, res) => {
  await db.delete(contractsTable).where(eq(contractsTable.id, req.params.id));
  await logAudit({ user: req.user, action: "delete", entityType: "contract", entityId: req.params.id });
  res.json({ message: "Contract deleted" });
});

// GET /api/contracts/:id/amendments
router.get("/:id/amendments", async (req, res) => {
  const amendments = await db
    .select({
      id: amendmentsTable.id,
      contractId: amendmentsTable.contractId,
      date: amendmentsTable.date,
      description: amendmentsTable.description,
      documentUrl: amendmentsTable.documentUrl,
      createdAt: amendmentsTable.createdAt,
      createdByName: usersTable.name,
    })
    .from(amendmentsTable)
    .leftJoin(usersTable, eq(amendmentsTable.createdBy, usersTable.id))
    .where(eq(amendmentsTable.contractId, req.params.id))
    .orderBy(desc(amendmentsTable.date));

  res.json(amendments);
});

// POST /api/contracts/:id/amendments
router.post("/:id/amendments", requireRole("admin", "legal"), async (req, res) => {
  const { date, description, documentUrl } = req.body;

  if (!date || !description) {
    res.status(400).json({ message: "date and description are required" });
    return;
  }

  const id = crypto.randomUUID();
  const [amendment] = await db
    .insert(amendmentsTable)
    .values({ id, contractId: req.params.id, date, description, documentUrl: documentUrl || null, createdBy: req.user!.id })
    .returning();

  await logAudit({ user: req.user, action: "create", entityType: "amendment", entityId: id, after: { contractId: req.params.id, date } });
  res.status(201).json({ ...amendment, createdByName: req.user!.name });
});

// GET /api/contracts/:id/attachments
router.get("/:id/attachments", async (req, res) => {
  const attachments = await db
    .select({
      id: contractAttachmentsTable.id,
      contractId: contractAttachmentsTable.contractId,
      fileName: contractAttachmentsTable.fileName,
      objectPath: contractAttachmentsTable.objectPath,
      contentType: contractAttachmentsTable.contentType,
      size: contractAttachmentsTable.size,
      createdAt: contractAttachmentsTable.createdAt,
      uploadedByName: usersTable.name,
    })
    .from(contractAttachmentsTable)
    .leftJoin(usersTable, eq(contractAttachmentsTable.uploadedBy, usersTable.id))
    .where(eq(contractAttachmentsTable.contractId, req.params.id))
    .orderBy(desc(contractAttachmentsTable.createdAt));

  res.json(attachments);
});

// POST /api/contracts/:id/attachments
router.post("/:id/attachments", requireRole("admin", "legal"), async (req, res) => {
  const { fileName, objectPath, contentType, size } = req.body;

  if (!fileName || !objectPath) {
    res.status(400).json({ message: "fileName and objectPath are required" });
    return;
  }

  // Only allow paths minted by our presigned upload flow
  if (!/^\/objects\/uploads\/[A-Za-z0-9-]+$/.test(objectPath)) {
    res.status(400).json({ message: "Invalid objectPath" });
    return;
  }

  const [contract] = await db
    .select({ id: contractsTable.id })
    .from(contractsTable)
    .where(eq(contractsTable.id, req.params.id));
  if (!contract) {
    res.status(404).json({ message: "Contract not found" });
    return;
  }

  const id = crypto.randomUUID();
  const [attachment] = await db
    .insert(contractAttachmentsTable)
    .values({
      id,
      contractId: req.params.id,
      fileName,
      objectPath,
      contentType: contentType || null,
      size: size ?? null,
      uploadedBy: req.user!.id,
    })
    .returning();

  await logAudit({ user: req.user, action: "create", entityType: "contract_attachment", entityId: id, after: { contractId: req.params.id, fileName } });
  res.status(201).json({ ...attachment, uploadedByName: req.user!.name });
});

// DELETE /api/contracts/:id/attachments/:attachmentId
router.delete("/:id/attachments/:attachmentId", requireRole("admin", "legal"), async (req, res) => {
  const [deleted] = await db
    .delete(contractAttachmentsTable)
    .where(
      and(
        eq(contractAttachmentsTable.id, req.params.attachmentId),
        eq(contractAttachmentsTable.contractId, req.params.id)
      )
    )
    .returning();

  if (!deleted) {
    res.status(404).json({ message: "Attachment not found" });
    return;
  }

  await logAudit({ user: req.user, action: "delete", entityType: "contract_attachment", entityId: deleted.id, before: { fileName: deleted.fileName } });
  res.status(204).end();
});

// Helper: get full contract by ID
async function getContractById(id: string) {
  const [contract] = await db
    .select()
    .from(contractsTable)
    .leftJoin(partnersTable, eq(contractsTable.partnerId, partnersTable.id))
    .leftJoin(usersTable, eq(contractsTable.createdBy, usersTable.id))
    .where(eq(contractsTable.id, id));

  if (!contract) return null;

  const [linkedContent, amendments] = await Promise.all([
    db
      .select({ id: contentItemsTable.id, type: contentItemsTable.type, title: contentItemsTable.title, year: contentItemsTable.year })
      .from(contractContentTable)
      .innerJoin(contentItemsTable, eq(contractContentTable.contentItemId, contentItemsTable.id))
      .where(eq(contractContentTable.contractId, id)),
    db
      .select()
      .from(amendmentsTable)
      .where(eq(amendmentsTable.contractId, id))
      .orderBy(desc(amendmentsTable.date)),
  ]);

  const c = contract.contracts;
  const p = contract.partners;
  const u = contract.users;

  return {
    id: c.id,
    direction: c.direction,
    partnerId: c.partnerId,
    partnerName: p?.name ?? null,
    licensor: c.licensor,
    licensee: c.licensee,
    status: c.status,
    startDate: c.startDate,
    endType: c.endType,
    endDate: c.endDate,
    territories: c.territories,
    otherTerritories: c.otherTerritories,
    distributionTypes: c.distributionTypes,
    platform: c.platform,
    royaltyType: c.royaltyType,
    royaltyDetails: c.royaltyDetails,
    paymentTerms: c.paymentTerms,
    notes: c.notes,
    documentUrl: c.documentUrl,
    websiteLink: c.websiteLink,
    rightsInDetails: c.direction === "rights_in" ? {
      platforms: c.rightsInPlatforms,
      youtubeChannel: c.rightsInYoutubeChannel,
      socialPlatforms: c.rightsInSocialPlatforms,
      socialHandle: c.rightsInSocialHandle,
      grantOfRights: c.rightsInGrantOfRights,
      exclusivityStartDate: c.rightsInExclusivityStartDate,
      exclusivityEndDate: c.rightsInExclusivityEndDate,
      exclusivitySameAsDuration: c.rightsInExclusivitySameAsDuration,
      marketingRights: c.rightsInMarketingRights,
    } : null,
    rightsOutDetails: c.direction === "rights_out" ? {
      autoRenew: c.rightsOutAutoRenew,
      hasAmendment: c.rightsOutHasAmendment,
      exclusivity: c.rightsOutExclusivity,
      reportingFrequency: c.rightsOutReportingFrequency,
      minPaymentThreshold: c.rightsOutMinPaymentThreshold ? Number(c.rightsOutMinPaymentThreshold) : null,
    } : null,
    contentItems: linkedContent.map(item => ({ ...item, contractCount: 0, seasons: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })),
    amendments,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    createdByName: u?.name ?? null,
  };
}

export default router;
