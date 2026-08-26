import { Router } from "express";
import multer from "multer";
import { authenticateToken, requireRole } from "../lib/auth";
import {
  IMPORT_HEADERS,
  hasFinancialImportValues,
  importContractRecords,
  parseContractImportCsv,
} from "../lib/contractImport";

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
    records = parseContractImportCsv(req.file.buffer.toString("utf-8"));
  } catch (error) {
    res.status(400).json({
      message: error instanceof Error ? error.message : "Invalid CSV file",
    });
    return;
  }
  if (req.user?.role === "legal" && hasFinancialImportValues(records)) {
    res.status(403).json({ message: "Legal users cannot import financial contract fields" });
    return;
  }

  res.json(await importContractRecords(records, req.user!));
});

export default router;
