import { db, contractsTable, partnersTable } from "@workspace/db";
import { ilike } from "drizzle-orm";
import { logAudit } from "./audit";
import {
  normalizeContractImportRecord,
  type ContractImportRecord,
} from "./contractImportCore";
export {
  IMPORT_HEADERS,
  hasFinancialImportValues,
  parseContractImportCsv,
} from "./contractImportCore";
import type { AuthenticatedUser } from "./auth";

export async function importContractRecords(records: ContractImportRecord[], user: AuthenticatedUser) {
  let imported = 0;
  let failed = 0;
  let createdPartners = 0;
  const errors: { row: number; message: string }[] = [];

  for (let i = 0; i < records.length; i++) {
    const rowNum = i + 2;
    try {
      const normalized = normalizeContractImportRecord(records[i]);
      const result = await db.transaction(async (tx) => {
        const [existingPartner] = await tx
          .select()
          .from(partnersTable)
          .where(ilike(partnersTable.name, normalized.partnerName));
        const partnerId = existingPartner?.id ?? crypto.randomUUID();
        if (!existingPartner) {
          await tx.insert(partnersTable).values({
            id: partnerId,
            name: normalized.partnerName,
            type: "Both",
          });
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
          websiteLink: normalized.websiteLink,
          createdBy: user.id,
        });
        return { contractId, createdPartner: !existingPartner };
      });

      await logAudit({
        user,
        action: "create",
        entityType: "contract",
        entityId: result.contractId,
        after: { source: "csv_import", row: rowNum },
      });
      if (result.createdPartner) createdPartners++;
      imported++;
    } catch (error) {
      failed++;
      errors.push({
        row: rowNum,
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return { imported, failed, errors, createdPartners };
}