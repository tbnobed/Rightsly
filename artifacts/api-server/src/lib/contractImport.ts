import {
  db,
  contractsTable,
  partnersTable,
  contentItemsTable,
  seasonsTable,
  contractContentTable,
  contractSeasonsTable,
} from "@workspace/db";
import { eq, ilike, inArray } from "drizzle-orm";
import { logAudit } from "./audit";
import {
  importAction,
  normalizeContractImportRecord,
  previewContractImportRecords as previewContractImportRecordsCore,
  type ContractImportRecord,
} from "./contractImportCore";
export {
  IMPORT_HEADERS,
  hasFinancialImportValues,
  parseContractImportCsv,
} from "./contractImportCore";
import type { AuthenticatedUser } from "./auth";

export async function previewContractImportRecords(records: ContractImportRecord[]) {
  const preview = previewContractImportRecordsCore(records);
  const normalizedRows = records.flatMap((record, index) => {
    try {
      if (importAction(record) !== "import") return [];
      return [{ row: index + 2, normalized: normalizeContractImportRecord(record) }];
    } catch {
      return [];
    }
  });
  const sourceKeys = normalizedRows
    .map(({ normalized }) => normalized.sourceKey)
    .filter((value): value is string => Boolean(value));
  const existingSourceKeys = sourceKeys.length
    ? new Set((await db
      .select({ sourceKey: contractsTable.importSourceKey })
      .from(contractsTable)
      .where(inArray(contractsTable.importSourceKey, sourceKeys)))
      .map(({ sourceKey }) => sourceKey)
      .filter((value): value is string => Boolean(value)))
    : new Set<string>();

  const content = await db
    .select({ title: contentItemsTable.title })
    .from(contentItemsTable);
  const seasons = await db
    .select({ title: contentItemsTable.title, seasonNumber: seasonsTable.seasonNumber })
    .from(seasonsTable)
    .innerJoin(contentItemsTable, eq(seasonsTable.contentItemId, contentItemsTable.id));
  const normalizeTitle = (value: string) => value.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
  const contentCounts = new Map<string, number>();
  const seasonCounts = new Map<string, number>();
  for (const item of content) {
    const key = normalizeTitle(item.title);
    contentCounts.set(key, (contentCounts.get(key) ?? 0) + 1);
  }
  for (const season of seasons) {
    const key = `${normalizeTitle(season.title)}::${season.seasonNumber}`;
    seasonCounts.set(key, (seasonCounts.get(key) ?? 0) + 1);
  }

  for (const { row, normalized } of normalizedRows) {
    if (normalized.sourceKey && existingSourceKeys.has(normalized.sourceKey)) {
      preview.ready--;
      preview.skipped++;
      preview.warnings.push({ row, message: "Already imported; duplicate source_key will be skipped" });
      continue;
    }
    for (const title of normalized.contentTitles) {
      const count = contentCounts.get(normalizeTitle(title)) ?? 0;
      if (count !== 1) {
        preview.warnings.push({
          row,
          message: count
            ? `Content title "${title}" has multiple exact matches and will not be linked`
            : `Content title "${title}" does not exist in Rightsly and will not be linked`,
        });
      }
    }
    for (const season of normalized.contentSeasons) {
      const count = seasonCounts.get(`${normalizeTitle(season.title)}::${season.seasonNumber}`) ?? 0;
      if (count !== 1) {
        preview.warnings.push({
          row,
          message: count
            ? `Season "${season.title} S${season.seasonNumber}" has multiple exact matches and will not be linked`
            : `Season "${season.title} S${season.seasonNumber}" does not exist in Rightsly and will not be linked`,
        });
      }
    }
  }
  return preview;
}

export async function importContractRecords(records: ContractImportRecord[], user: AuthenticatedUser) {
  let imported = 0;
  let failed = 0;
  let skipped = 0;
  let review = 0;
  let duplicates = 0;
  let createdPartners = 0;
  let linkedContent = 0;
  let linkedSeasons = 0;
  const errors: { row: number; message: string }[] = [];
  const warnings: { row: number; message: string }[] = [];

  const content = await db
    .select({ id: contentItemsTable.id, title: contentItemsTable.title })
    .from(contentItemsTable);
  const seasons = await db
    .select({
      id: seasonsTable.id,
      title: contentItemsTable.title,
      seasonNumber: seasonsTable.seasonNumber,
    })
    .from(seasonsTable)
    .innerJoin(contentItemsTable, eq(seasonsTable.contentItemId, contentItemsTable.id));
  const normalizeTitle = (value: string) => value.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
  const contentByTitle = new Map<string, typeof content>();
  for (const item of content) {
    const key = normalizeTitle(item.title);
    contentByTitle.set(key, [...(contentByTitle.get(key) ?? []), item]);
  }
  const seasonsByReference = new Map<string, typeof seasons>();
  for (const season of seasons) {
    const key = `${normalizeTitle(season.title)}::${season.seasonNumber}`;
    seasonsByReference.set(key, [...(seasonsByReference.get(key) ?? []), season]);
  }

  for (let i = 0; i < records.length; i++) {
    const rowNum = i + 2;
    try {
      const action = importAction(records[i]);
      if (action === "skip") {
        skipped++;
        if (records[i].review_notes) warnings.push({ row: rowNum, message: records[i].review_notes });
        continue;
      }
      if (action === "review") {
        review++;
        warnings.push({
          row: rowNum,
          message: records[i].review_notes || "This row requires review before it can be imported",
        });
        continue;
      }
      const normalized = normalizeContractImportRecord(records[i]);
      const result = await db.transaction(async (tx) => {
        if (normalized.sourceKey) {
          const [existingContract] = await tx
            .select({ id: contractsTable.id })
            .from(contractsTable)
            .where(eq(contractsTable.importSourceKey, normalized.sourceKey));
          if (existingContract) {
            return {
              contractId: existingContract.id,
              createdPartner: false,
              duplicate: true,
              linkedContent: 0,
              linkedSeasons: 0,
              warnings: [] as string[],
            };
          }
        }

        const [existingPartner] = await tx
          .select()
          .from(partnersTable)
          .where(ilike(partnersTable.name, normalized.partnerName));
        const partnerId = existingPartner?.id ?? crypto.randomUUID();
        const importedPartnerType = normalized.direction === "rights_out" ? "Licensee" : "Licensor";
        if (!existingPartner) {
          await tx.insert(partnersTable).values({
            id: partnerId,
            name: normalized.partnerName,
            type: importedPartnerType,
            website: normalized.partnerWebsite,
            notes: normalized.partnerContacts
              ? `Imported contacts${normalized.sourceKey ? ` (${normalized.sourceKey})` : ""}: ${normalized.partnerContacts}`
              : null,
          });
        } else {
          const updates: Partial<typeof partnersTable.$inferInsert> = {};
          if (!existingPartner.website && normalized.partnerWebsite) {
            updates.website = normalized.partnerWebsite;
          }
          if (existingPartner.type !== importedPartnerType && existingPartner.type !== "Both") {
            updates.type = "Both";
          }
          const contactMarker = normalized.sourceKey
            ? `Imported contacts (${normalized.sourceKey}):`
            : "Imported contacts:";
          if (normalized.partnerContacts && !existingPartner.notes?.includes(contactMarker)) {
            updates.notes = [existingPartner.notes, `${contactMarker} ${normalized.partnerContacts}`]
              .filter(Boolean)
              .join("\n");
          }
          if (Object.keys(updates).length) {
            await tx.update(partnersTable).set(updates).where(eq(partnersTable.id, partnerId));
          }
        }

        const contractId = crypto.randomUUID();
        await tx.insert(contractsTable).values({
          id: contractId,
          direction: normalized.direction,
          partnerId,
          licensor: normalized.licensor,
          licensee: normalized.licensee,
          status: normalized.status,
          startDate: normalized.startDate,
          endType: normalized.endType,
          endDate: normalized.endDate,
          territories: normalized.territories,
          distributionTypes: normalized.distributionTypes,
          platform: normalized.platform,
          royaltyType: normalized.royaltyType,
          royaltyDetails: normalized.royaltyDetails,
          paymentTerms: normalized.paymentTerms,
          notes: normalized.notes,
          documentUrl: normalized.documentUrl,
          websiteLink: normalized.websiteLink,
          importSourceKey: normalized.sourceKey,
          importSourceSheet: normalized.sourceSheet,
          importSourceRow: normalized.sourceRow,
          importRawData: normalized.rawSourceData,
          rightsOutAutoRenew: normalized.direction === "rights_out" && normalized.endType === "auto_renew",
          rightsOutReportingFrequency: normalized.direction === "rights_out"
            ? normalized.reportingFrequency
            : null,
          createdBy: user.id,
        });

        const rowWarnings: string[] = [];
        let rowLinkedContent = 0;
        let rowLinkedSeasons = 0;
        for (const title of normalized.contentTitles) {
          const matches = contentByTitle.get(normalizeTitle(title)) ?? [];
          if (matches.length === 1) {
            await tx.insert(contractContentTable).values({
              contractId,
              contentItemId: matches[0].id,
            });
            rowLinkedContent++;
          } else {
            rowWarnings.push(
              matches.length
                ? `Content title "${title}" matched multiple Rightsly titles and was not linked`
                : `Content title "${title}" was not found and was not linked`,
            );
          }
        }
        for (const season of normalized.contentSeasons) {
          const reference = `${normalizeTitle(season.title)}::${season.seasonNumber}`;
          const matches = seasonsByReference.get(reference) ?? [];
          if (matches.length === 1) {
            await tx.insert(contractSeasonsTable).values({
              contractId,
              seasonId: matches[0].id,
            });
            rowLinkedSeasons++;
          } else {
            rowWarnings.push(
              matches.length
                ? `Season "${season.title} S${season.seasonNumber}" matched multiple Rightsly seasons and was not linked`
                : `Season "${season.title} S${season.seasonNumber}" was not found and was not linked`,
            );
          }
        }
        return {
          contractId,
          createdPartner: !existingPartner,
          duplicate: false,
          linkedContent: rowLinkedContent,
          linkedSeasons: rowLinkedSeasons,
          warnings: rowWarnings,
        };
      });

      if (result.duplicate) {
        duplicates++;
        skipped++;
        warnings.push({ row: rowNum, message: "Already imported; duplicate source_key was skipped" });
        continue;
      }
      await logAudit({
        user,
        action: "create",
        entityType: "contract",
        entityId: result.contractId,
        after: {
          source: "csv_import",
          row: rowNum,
          sourceKey: normalized.sourceKey,
          sourceSheet: normalized.sourceSheet,
          sourceRow: normalized.sourceRow,
        },
      });
      if (result.createdPartner) createdPartners++;
      linkedContent += result.linkedContent;
      linkedSeasons += result.linkedSeasons;
      warnings.push(...result.warnings.map((message) => ({ row: rowNum, message })));
      if (normalized.reviewNotes) warnings.push({ row: rowNum, message: normalized.reviewNotes });
      imported++;
    } catch (error) {
      if (
        records[i].source_key &&
        (error as { code?: string }).code === "23505"
      ) {
        const [existingContract] = await db
          .select({ id: contractsTable.id })
          .from(contractsTable)
          .where(eq(contractsTable.importSourceKey, records[i].source_key));
        if (existingContract) {
          duplicates++;
          skipped++;
          warnings.push({ row: rowNum, message: "Already imported; duplicate source_key was skipped" });
          continue;
        }
      }
      failed++;
      errors.push({
        row: rowNum,
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return {
    imported,
    failed,
    skipped,
    review,
    duplicates,
    errors,
    warnings,
    createdPartners,
    linkedContent,
    linkedSeasons,
  };
}