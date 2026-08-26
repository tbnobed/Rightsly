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
import { eq, and, or, ilike, inArray, sql, count, lte, gte, asc, desc } from "drizzle-orm";
import { authenticateToken, requireRole } from "../lib/auth";
import { logAudit } from "../lib/audit";
import { validateContractDates } from "../lib/contractDates";
import {
  canonicalDistributionTypes,
  canonicalTerritories,
  unrecognizedDistributionTypes,
  unrecognizedTerritories,
} from "../lib/rightsVocabulary";
import { routeParam, validateHttpUrl } from "../lib/validation";
import { displayContractStatus } from "../lib/contractStatus";

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
  const contentSearch = req.query.contentSearch as string | undefined;
  const departmentTag = req.query.departmentTag as string | undefined;
  const includeArchived = req.query.includeArchived === "true";
  const expiringWithinDays = req.query.expiringWithinDays
    ? parseInt(req.query.expiringWithinDays as string)
    : undefined;
  const today = new Date().toISOString().split("T")[0];

  const conditions: any[] = [];
  if (direction) conditions.push(eq(contractsTable.direction, direction as any));
  if (status === "active") {
    conditions.push(
      and(
        eq(contractsTable.status, "active"),
        sql`(${contractsTable.endType} <> 'date' OR ${contractsTable.endDate} >= ${today})`,
      ),
    );
  } else if (status === "expired") {
    conditions.push(
      or(
        eq(contractsTable.status, "expired"),
        and(
          eq(contractsTable.status, "active"),
          eq(contractsTable.endType, "date"),
          sql`${contractsTable.endDate} < ${today}`,
        ),
      ),
    );
  } else if (status) {
    conditions.push(eq(contractsTable.status, status as any));
  }
  if (partnerId) conditions.push(eq(contractsTable.partnerId, partnerId));
  if (search) conditions.push(ilike(partnersTable.name, `%${search}%`));
  if (contentSearch) {
    conditions.push(
      sql`exists (select 1 from contract_content cc join content_items ci on ci.id = cc.content_item_id where cc.contract_id = ${contractsTable.id} and ci.title ilike ${`%${contentSearch}%`})`
    );
  }
  if (departmentTag) {
    conditions.push(sql`${contractsTable.departmentTags}::jsonb ? ${departmentTag}`);
  }
  if (!includeArchived) conditions.push(eq(contractsTable.archived, false));
  if ((req as typeof req & { salesFilter?: boolean }).salesFilter) {
    conditions.push(
      and(
        eq(contractsTable.status, "active"),
        sql`(${contractsTable.endType} <> 'date' OR ${contractsTable.endDate} >= ${today})`,
      ),
    );
  }
  if (expiringWithinDays) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + expiringWithinDays);
    conditions.push(
      and(
        eq(contractsTable.endType, "date"),
        lte(contractsTable.endDate, cutoff.toISOString().split("T")[0]),
        gte(contractsTable.endDate, today)
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
        departmentTags: contractsTable.departmentTags,
        archived: contractsTable.archived,
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

  res.json({
    data: contracts.map((contract) =>
      displayContractStatus({
        ...contract,
        territories: canonicalTerritories(contract.territories),
        distributionTypes: canonicalDistributionTypes(contract.distributionTypes),
      }),
    ),
    total: Number(total),
    page,
    pageSize,
  });
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
    departmentTags,
  } = req.body;

  if (!direction || !partnerId || !endType) {
    res.status(400).json({ message: "direction, partnerId, endType are required" });
    return;
  }

  const dateError = validateContractDates({ startDate, endType, endDate });
  if (dateError) {
    res.status(400).json({ message: dateError });
    return;
  }
  const websiteError = validateHttpUrl(websiteLink);
  if (websiteError) { res.status(400).json({ message: websiteError }); return; }
  const unknownTerritories = unrecognizedTerritories(territories ?? []);
  if (unknownTerritories.length) {
    res.status(400).json({ message: `Unrecognized territories: ${unknownTerritories.join(", ")}` });
    return;
  }
  const unknownDistributionTypes = unrecognizedDistributionTypes(distributionTypes ?? []);
  if (unknownDistributionTypes.length) {
    res.status(400).json({ message: `Unrecognized distribution types: ${unknownDistributionTypes.join(", ")}` });
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
      territories: canonicalTerritories(territories),
      otherTerritories: otherTerritories || null,
      distributionTypes: canonicalDistributionTypes(distributionTypes),
      platform: platform || null,
      royaltyType: royaltyType || null,
      royaltyDetails: royaltyDetails || null,
      paymentTerms: paymentTerms || null,
      notes: notes || null,
      websiteLink: websiteLink || null,
      departmentTags: departmentTags || [],
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
  const contract = await getContractById(routeParam(req.params.id));
  if (
    !contract ||
    (req.user?.role === "sales" && (contract.archived || contract.status !== "active"))
  ) {
    res.status(404).json({ message: "Contract not found" });
    return;
  }
  res.json(contract);
});

// PUT /api/contracts/:id
router.put("/:id", requireRole("admin", "legal"), async (req, res) => {
  const id = routeParam(req.params.id);
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
    departmentTags,
    archived,
  } = req.body;

  const [existingContract] = await db
    .select({
      startDate: contractsTable.startDate,
      endType: contractsTable.endType,
      endDate: contractsTable.endDate,
    })
    .from(contractsTable)
    .where(eq(contractsTable.id, id));
  if (!existingContract) {
    res.status(404).json({ message: "Contract not found" });
    return;
  }

  const effectiveEndType = endType !== undefined ? endType : existingContract.endType;
  const effectiveStartDate = startDate !== undefined ? startDate : existingContract.startDate;
  const effectiveEndDate =
    effectiveEndType !== "date"
      ? null
      : endDate !== undefined
        ? endDate
        : existingContract.endDate;
  const dateError = validateContractDates({
    startDate: effectiveStartDate,
    endType: effectiveEndType,
    endDate: effectiveEndDate,
  });
  if (dateError) {
    res.status(400).json({ message: dateError });
    return;
  }
  if (websiteLink !== undefined) {
    const websiteError = validateHttpUrl(websiteLink);
    if (websiteError) { res.status(400).json({ message: websiteError }); return; }
  }
  if (territories !== undefined) {
    const unknownTerritories = unrecognizedTerritories(territories);
    if (unknownTerritories.length) {
      res.status(400).json({ message: `Unrecognized territories: ${unknownTerritories.join(", ")}` });
      return;
    }
  }
  if (distributionTypes !== undefined) {
    const unknownDistributionTypes = unrecognizedDistributionTypes(distributionTypes);
    if (unknownDistributionTypes.length) {
      res.status(400).json({ message: `Unrecognized distribution types: ${unknownDistributionTypes.join(", ")}` });
      return;
    }
  }

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
  if (endType !== undefined && endType !== "date") updates.endDate = null;
  if (territories !== undefined) updates.territories = canonicalTerritories(territories);
  if (otherTerritories !== undefined) updates.otherTerritories = otherTerritories;
  if (distributionTypes !== undefined) updates.distributionTypes = canonicalDistributionTypes(distributionTypes);
  if (platform !== undefined) updates.platform = platform;
  if (royaltyType !== undefined) updates.royaltyType = royaltyType;
  if (royaltyDetails !== undefined) updates.royaltyDetails = royaltyDetails;
  if (paymentTerms !== undefined) updates.paymentTerms = paymentTerms;
  if (notes !== undefined) updates.notes = notes;
  if (websiteLink !== undefined) updates.websiteLink = websiteLink;
  if (departmentTags !== undefined) updates.departmentTags = departmentTags;
  if (archived !== undefined) updates.archived = archived;

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

  await db.update(contractsTable).set(updates).where(eq(contractsTable.id, id));

  if (contentItemIds !== undefined) {
    await db.delete(contractContentTable).where(eq(contractContentTable.contractId, id));
    if (contentItemIds.length) {
      await db.insert(contractContentTable).values(
        contentItemIds.map((cid: string) => ({ contractId: id, contentItemId: cid }))
      );
    }
  }

  const prevStatus = req.body._prevStatus;
  const action = status && status !== prevStatus ? "status_change" : "update";
  await logAudit({ user: req.user, action, entityType: "contract", entityId: id, after: updates });

  res.json(await getContractById(id));
});

// DELETE /api/contracts/:id
router.delete("/:id", requireRole("admin"), async (req, res) => {
  const id = routeParam(req.params.id);
  await db.delete(contractsTable).where(eq(contractsTable.id, id));
  await logAudit({ user: req.user, action: "delete", entityType: "contract", entityId: id });
  res.json({ message: "Contract deleted" });
});

// GET /api/contracts/:id/amendments
router.get("/:id/amendments", async (req, res) => {
  const contractId = routeParam(req.params.id);
  if (!(await canReadContract(req.user?.role, contractId))) {
    res.status(404).json({ message: "Contract not found" });
    return;
  }
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
    .where(eq(amendmentsTable.contractId, contractId))
    .orderBy(desc(amendmentsTable.date));

  res.json(amendments);
});

// POST /api/contracts/:id/amendments
router.post("/:id/amendments", requireRole("admin", "legal"), async (req, res) => {
  const contractId = routeParam(req.params.id);
  const { date, description, documentUrl } = req.body;

  if (!date || !description) {
    res.status(400).json({ message: "date and description are required" });
    return;
  }

  const id = crypto.randomUUID();
  const [amendment] = await db
    .insert(amendmentsTable)
    .values({ id, contractId, date, description, documentUrl: documentUrl || null, createdBy: req.user!.id })
    .returning();

  await logAudit({ user: req.user, action: "create", entityType: "amendment", entityId: id, after: { contractId, date } });
  res.status(201).json({ ...amendment, createdByName: req.user!.name });
});

// DELETE /api/contracts/:id/amendments/:amendmentId
router.delete("/:id/amendments/:amendmentId", requireRole("admin", "legal"), async (req, res) => {
  const contractId = routeParam(req.params.id);
  const amendmentId = routeParam(req.params.amendmentId);
  const [deleted] = await db
    .delete(amendmentsTable)
    .where(and(
      eq(amendmentsTable.id, amendmentId),
      eq(amendmentsTable.contractId, contractId),
    ))
    .returning({ id: amendmentsTable.id });
  if (!deleted) {
    res.status(404).json({ message: "Amendment not found" });
    return;
  }
  await logAudit({
    user: req.user,
    action: "delete",
    entityType: "amendment",
    entityId: amendmentId,
    before: { contractId },
  });
  res.json({ message: "Amendment deleted" });
});

// GET /api/contracts/:id/attachments
router.get("/:id/attachments", async (req, res) => {
  const contractId = routeParam(req.params.id);
  if (!(await canReadContract(req.user?.role, contractId))) {
    res.status(404).json({ message: "Contract not found" });
    return;
  }
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
    .where(eq(contractAttachmentsTable.contractId, contractId))
    .orderBy(desc(contractAttachmentsTable.createdAt));

  res.json(attachments);
});

// POST /api/contracts/:id/attachments
router.post("/:id/attachments", requireRole("admin", "legal"), async (req, res) => {
  const contractId = routeParam(req.params.id);
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
    .where(eq(contractsTable.id, contractId));
  if (!contract) {
    res.status(404).json({ message: "Contract not found" });
    return;
  }

  const id = crypto.randomUUID();
  const [attachment] = await db
    .insert(contractAttachmentsTable)
    .values({
      id,
      contractId,
      fileName,
      objectPath,
      contentType: contentType || null,
      size: size ?? null,
      uploadedBy: req.user!.id,
    })
    .returning();

  await logAudit({ user: req.user, action: "create", entityType: "contract_attachment", entityId: id, after: { contractId, fileName } });
  res.status(201).json({ ...attachment, uploadedByName: req.user!.name });
});

// DELETE /api/contracts/:id/attachments/:attachmentId
router.delete("/:id/attachments/:attachmentId", requireRole("admin", "legal"), async (req, res) => {
  const contractId = routeParam(req.params.id);
  const attachmentId = routeParam(req.params.attachmentId);
  const [deleted] = await db
    .delete(contractAttachmentsTable)
    .where(
      and(
        eq(contractAttachmentsTable.id, attachmentId),
        eq(contractAttachmentsTable.contractId, contractId)
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
    status: displayContractStatus(c).status,
    startDate: c.startDate,
    endType: c.endType,
    endDate: c.endDate,
    territories: canonicalTerritories(c.territories),
    otherTerritories: c.otherTerritories,
    distributionTypes: canonicalDistributionTypes(c.distributionTypes),
    platform: c.platform,
    royaltyType: c.royaltyType,
    royaltyDetails: c.royaltyDetails,
    paymentTerms: c.paymentTerms,
    notes: c.notes,
    documentUrl: c.documentUrl,
    websiteLink: c.websiteLink,
    departmentTags: c.departmentTags,
    archived: c.archived,
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

async function canReadContract(role: string | undefined, id: string) {
  if (role !== "sales") return true;
  const [contract] = await db
    .select({
      status: contractsTable.status,
      endType: contractsTable.endType,
      endDate: contractsTable.endDate,
      archived: contractsTable.archived,
    })
    .from(contractsTable)
    .where(eq(contractsTable.id, id));

  return !!contract &&
    !contract.archived &&
    displayContractStatus(contract).status === "active";
}

export default router;
