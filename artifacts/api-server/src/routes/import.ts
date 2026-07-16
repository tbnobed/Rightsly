import { Router } from "express";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { db } from "@workspace/db";
import { contractsTable, partnersTable, contractContentTable } from "@workspace/db";
import { eq, ilike } from "drizzle-orm";
import { authenticateToken, requireRole } from "../lib/auth";
import { logAudit } from "../lib/audit";

const router = Router();
router.use(authenticateToken, requireRole("admin", "legal"));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// GET /api/import/template
router.get("/template", (_req, res) => {
  const headers = [
    "direction",
    "partner_name",
    "licensor",
    "licensee",
    "status",
    "start_date",
    "end_type",
    "end_date",
    "territories",
    "distribution_types",
    "platform",
    "royalty_type",
    "royalty_details",
    "payment_terms",
    "notes",
    "website_link",
  ];

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
    records = parse(req.file.buffer.toString("utf-8"), {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
  } catch (err) {
    res.status(400).json({ message: "Invalid CSV file" });
    return;
  }

  let imported = 0;
  let failed = 0;
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
        territories: row.territories ? row.territories.split("|").map((t) => t.trim()) : [],
        distributionTypes: row.distribution_types ? row.distribution_types.split("|").map((t) => t.trim()) : [],
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

  res.json({ imported, failed, errors });
});

export default router;
