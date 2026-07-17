import type { Response } from "express";

export interface PdfColumn {
  header: string;
  key: string;
  width: number; // relative weight
}

/**
 * Stream a simple, paginated table PDF to the response.
 */
export async function sendPdfReport(
  res: Response,
  opts: {
    filename: string;
    title: string;
    subtitle?: string;
    columns: PdfColumn[];
    rows: Record<string, unknown>[];
  }
) {
  const { default: PDFDocument } = await import("pdfkit");
  const doc = new PDFDocument({ size: "LETTER", layout: "landscape", margin: 40 });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename=${opts.filename}`);

  doc.on("error", (err: Error) => {
    console.error("PDF generation stream error:", err);
    if (!res.headersSent) {
      res.status(500).json({ message: "PDF generation failed" });
    } else {
      res.destroy();
    }
  });
  // If the client disconnects mid-stream, stop generating.
  res.on("close", () => {
    if (!res.writableEnded) doc.destroy();
  });

  doc.pipe(res);

  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const totalWeight = opts.columns.reduce((s, c) => s + c.width, 0);
  const colWidths = opts.columns.map((c) => (c.width / totalWeight) * pageWidth);
  const startX = doc.page.margins.left;
  const bottomY = doc.page.height - doc.page.margins.bottom;
  const rowPadding = 5;

  const drawHeader = () => {
    doc.fontSize(16).fillColor("#0f172a").font("Helvetica-Bold").text(opts.title, startX, doc.y);
    doc.moveDown(0.2);
    doc.fontSize(9).fillColor("#64748b").font("Helvetica").text(
      opts.subtitle ?? `Generated ${new Date().toISOString().split("T")[0]} — Rightsly`
    );
    doc.moveDown(0.8);
    drawTableHead();
  };

  const drawTableHead = () => {
    const y = doc.y;
    doc.rect(startX, y, pageWidth, 20).fill("#0f172a");
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(8);
    let x = startX;
    opts.columns.forEach((c, i) => {
      doc.text(c.header.toUpperCase(), x + rowPadding, y + 6, { width: colWidths[i] - rowPadding * 2, ellipsis: true, lineBreak: false });
      x += colWidths[i];
    });
    doc.y = y + 20;
  };

  drawHeader();

  doc.font("Helvetica").fontSize(8);
  opts.rows.forEach((row, idx) => {
    const cells = opts.columns.map((c) => {
      const v = row[c.key];
      if (v === null || v === undefined) return "";
      if (Array.isArray(v)) return v.join(", ");
      return String(v);
    });
    const heights = cells.map((text, i) =>
      doc.heightOfString(text || " ", { width: colWidths[i] - rowPadding * 2 })
    );
    const rowHeight = Math.max(...heights) + rowPadding * 2;

    if (doc.y + rowHeight > bottomY) {
      doc.addPage();
      doc.y = doc.page.margins.top;
      drawTableHead();
      doc.font("Helvetica").fontSize(8);
    }

    const y = doc.y;
    if (idx % 2 === 1) {
      doc.rect(startX, y, pageWidth, rowHeight).fill("#f8fafc");
    }
    doc.fillColor("#334155");
    let x = startX;
    cells.forEach((text, i) => {
      doc.text(text, x + rowPadding, y + rowPadding, { width: colWidths[i] - rowPadding * 2 });
      x += colWidths[i];
    });
    doc.y = y + rowHeight;
    doc
      .moveTo(startX, doc.y)
      .lineTo(startX + pageWidth, doc.y)
      .lineWidth(0.5)
      .strokeColor("#e2e8f0")
      .stroke();
  });

  if (opts.rows.length === 0) {
    doc.moveDown(1).fontSize(10).fillColor("#64748b").text("No records match this report.");
  }

  doc.end();
}
