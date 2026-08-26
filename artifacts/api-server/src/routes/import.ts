import { Router } from "express";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { db } from "@workspace/db";
import { contractsTable, partnersTable, contractContentTable } from "@workspace/db";
import { eq, ilike } from "drizzle-orm";
import { authenticateToken, requireRole } from "../lib/auth";
import { logAudit } from "../lib/audit";
import { validateContractDates } from "../lib/contractDates";
import {
  canonicalDistributionTypes,
  canonicalTerritories,
  unrecognizedDistributionTypes,
  unrecognizedTerritories,
} from "../lib/rightsVocabulary";
import { validateHttpUrl } from "../lib/validation";

const IMPORT_HEADERS = ["direction", "partner_name", "licensor", "licensee", "status", "start_date", "end_type", "end_date", "territories", "distribution_types", "platform", "royalty_type", "royalty_details", "payment_terms", "notes", "website_link"];
const REQUIRED_IMPORT_HEADERS = ["direction", "partner_name", "end_type"];

const router = Router();
router.use(authenticateToken, requireRole("admin", "legal"));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// GET /api/import/template
router.get("/template", (_req, res) => {
  const headers = IMPORT_HEADERS;

  const exampleRow = [
    "rights_out",
    "Tubi TV",
    "TBN",
    "Tubi TV",
    "active",
    "2024-01-01",
    "date",
    "2026-12-31",
    "US|Canada",
    "FAST|AVOD",
    "Tubi",
    "revenue_share",
    "70/30",
    "net_30",
    "Sample contract",
    "https://tubi.tv",
  ];

  const csv = [headers.join(","), exampleRow.join(",")].join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=contract-import-template.csv");
  res.send(csv);
});

// POST /api/import/contracts
router.post("/contracts", upload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ message: "No file uploaded" });
    return;
  }

  let records: Record<string, string>[];
  try {
    const source = req.file.buffer.toString("utf-8");
    const [header] = parse(source, { to_line: 1, trim: true, skip_empty_lines: true }) as string[][];
    const unknown = (header ?? []).filter((name) => !IMPORT_HEADERS.includes(name));
    const missing = REQUIRED_IMPORT_HEADERS.filter((name) => !(header ?? []).includes(name));
    if (unknown.length) {
      res.status(400).json({ message: `Unrecognized columns: ${unknown.join(", ")}` });
      return;
    }
    if (missing.length) {
      res.status(400).json({ message: `Missing required columns: ${missing.join(", ")}` });
      return;
    }
    records = (parse(source, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, string>[]).filter((row) =>
      Object.values(row).some((value) => value.trim().length > 0),
    );
  } catch (err) {
    res.status(400).json({ message: "Invalid CSV file" });
    return;
  }

  let imported = 0;
  let failed = 0;
  let createdPartners = 0;
  const errors: { row: number; message: string }[] = [];

  for (let i = 0; i < records.length; i++) {
    const row = records[i];
    const rowNum = i + 2; // 1-indexed, skipping header

    try {
      if (!row.direction || !["rights_in", "rights_out"].includes(row.direction)) {
        throw new Error('direction must be "rights_in" or "rights_out"');
      }
      if (!row.partner_name) throw new Error("partner_name is required");
      if (!row.end_type || !["date", "perpetuity", "auto_renew"].includes(row.end_type)) {
        throw new Error('end_type must be "date", "perpetuity", or "auto_renew"');
      }
      const dateError = validateContractDates({
        startDate: row.start_date || null,
        endType: row.end_type,
        endDate: row.end_date || null,
      });
      if (dateError) throw new Error(dateError);
      const websiteError = validateHttpUrl(row.website_link);
      if (websiteError) throw new Error(websiteError);
      const rawTerritories = row.territories ? row.territories.split(/[|,;]/) : [];
      const unknownTerritories = unrecognizedTerritories(rawTerritories);
      if (unknownTerritories.length) {
        throw new Error(`Unrecognized territories: ${unknownTerritories.join(", ")}`);
      }
      const rawDistributionTypes = row.distribution_types ? row.distribution_types.split(/[|,;]/) : [];
      const unknownDistributionTypes = unrecognizedDistributionTypes(rawDistributionTypes);
      if (unknownDistributionTypes.length) {
        throw new Error(`Unrecognized distribution types: ${unknownDistributionTypes.join(", ")}`);
      }

      // Find or create partner
      const [existingPartner] = await db
        .select()
        .from(partnersTable)
        .where(ilike(partnersTable.name, row.partner_name.trim()));

      let partnerId: string;
      if (existingPartner) {
        partnerId = existingPartner.id;
      } else {
        partnerId = crypto.randomUUID();
        await db.insert(partnersTable).values({
          id: partnerId,
          name: row.partner_name.trim(),
          type: "Both",
        });
        createdPartners++;
      }

      const contractId = crypto.randomUUID();
      await db.insert(contractsTable).values({
        id: contractId,
        direction: row.direction as any,
        partnerId,
        licensor: row.licensor || null,
        licensee: row.licensee || null,
        status: (row.status as any) || "draft",
        startDate: row.start_date || null,
        endType: row.end_type as any,
        endDate: row.end_date || null,
        territories: canonicalTerritories(rawTerritories),
        distributionTypes: canonicalDistributionTypes(rawDistributionTypes),
        platform: row.platform || null,
        royaltyType: (row.royalty_type as any) || null,
        royaltyDetails: row.royalty_details || null,
        paymentTerms: (row.payment_terms as any) || null,
        notes: row.notes || null,
        websiteLink: row.website_link || null,
        createdBy: req.user!.id,
      });

      await logAudit({ user: req.user, action: "create", entityType: "contract", entityId: contractId, after: { source: "csv_import", row: rowNum } });
      imported++;
    } catch (err: any) {
      failed++;
      errors.push({ row: rowNum, message: err.message || "Unknown error" });
    }
  }

  res.json({ imported, failed, errors, createdPartners });
});

export default router;
