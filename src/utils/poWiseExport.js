// Export helpers for the PO Wise Report.
// Mirrors absExport.js / dateWiseExport.js — Excel via SheetJS (xlsx),
// PDF via jspdf + jspdf-autotable.

import * as XLSX from "xlsx";
import { fmtNum, drawPdfCompany } from "./format";
import { QTY_STATUS_LABELS, PAYMENT_STATUS_LABELS, getPOWiseColumnConfig } from "./poWiseReport";

// Column specs: one entry per column. `v` reads a row value, `t` reads the
// Grand Total value; `dec` is the decimals used in the PDF; `right` aligns
// numbers right; `w` is the Excel column width. The set of columns depends on
// the Work Type filter (see getPOWiseColumnConfig).
function buildColumns(workType) {
  const cfg = getPOWiseColumnConfig(workType);
  const n = (x) => Number(x) || 0;
  const cols = [
    { h: "PO Code", v: (r) => r.poCode, t: () => "Grand Total", w: 16 },
    { h: "PO No.", v: (r) => r.poNumber, w: 12 },
    { h: "Invoices", v: (r) => r.invoiceCount, w: 9, right: true },
    ...(cfg.showNos
      ? [
          { h: "Nos. Ordered", v: (r) => (r.isCT ? n(r.nosOrdered) : "-"), t: (g) => n(g.nosOrdered), dec: 0, w: 12, right: true },
        ]
      : []),
    { h: "Wt. Ordered (kg)", v: (r) => n(r.kgOrdered), t: (g) => n(g.kgOrdered), dec: 1, w: 15, right: true },
    { h: "Wt. Billed (kg)", v: (r) => n(r.kgBilled), t: (g) => n(g.kgBilled), dec: 1, w: 14, right: true },
    { h: "Wt. Balance (kg)", v: (r) => n(r.kgBalance), t: (g) => n(g.kgBalance), dec: 1, w: 15, right: true },
    { h: "% Complete", v: (r) => `${fmtNum(r.pctComplete, 0)}%`, w: 11, right: true },
    { h: "Qty Status", v: (r) => QTY_STATUS_LABELS[r.qtyStatus] || r.qtyStatus, w: 13 },
    { h: "Basic", v: (r) => n(r.basic), t: (g) => n(g.basic), dec: 0, w: 12, right: true },
    { h: "GST", v: (r) => n(r.gst), t: (g) => n(g.gst), dec: 0, w: 10, right: true },
    { h: "Gross Value", v: (r) => n(r.grossValue), t: (g) => n(g.grossValue), dec: 2, w: 13, right: true },
  ];
  if (cfg.showMatAdv)
    cols.push({ h: "Mat. Adv.", v: (r) => n(r.matAdvance), t: (g) => n(g.matAdvance), dec: 0, w: 11, right: true });
  if (cfg.showGstTds)
    cols.push({ h: "GST TDS @2%", v: (r) => n(r.gstTds), t: (g) => n(g.gstTds), dec: 0, w: 12, right: true });
  cols.push(
    { h: "TDS", v: (r) => n(r.tds), t: (g) => n(g.tds), dec: 0, w: 10, right: true },
    { h: "Net Recv.", v: (r) => n(r.netReceivable), t: (g) => n(g.netReceivable), dec: 0, w: 13, right: true },
    { h: "Paid Amount", v: (r) => n(r.paymentReceived), t: (g) => n(g.paymentReceived), dec: 0, w: 13, right: true },
    { h: "Balance", v: (r) => n(r.balanceToReceive), t: (g) => n(g.balanceToReceive), dec: 0, w: 12, right: true },
    { h: "Payment Status", v: (r) => PAYMENT_STATUS_LABELS[r.paymentStatus] || r.paymentStatus, w: 15 }
  );
  return cols;
}

function stamp() {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Excel export
// ---------------------------------------------------------------------------

export function exportPOWiseReportToExcel(
  report,
  rows,
  { workType, filename = `PO-Wise-Report-${stamp()}.xlsx` } = {}
) {
  if (!report) return;

  const cols = buildColumns(workType);
  const data = [cols.map((c) => c.h)];
  rows.forEach((r) => data.push(cols.map((c) => c.v(r))));
  data.push(cols.map((c) => (c.t ? c.t(report.grandTotal) : "")));

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = cols.map((c) => ({ wch: c.w }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "PO Wise Report");
  XLSX.writeFile(wb, filename);
}

// ---------------------------------------------------------------------------
// PDF export
// ---------------------------------------------------------------------------

// PDF cells: numbers get the column's decimals, text stays as-is.
function fmtPdf(c, v) {
  return c.dec !== undefined && typeof v === "number" ? fmtNum(v, c.dec) : String(v);
}

export async function exportPOWiseReportToPDF(
  report,
  rows,
  { company, workType, filename = `PO-Wise-Report-${stamp()}.pdf` } = {}
) {
  if (!report) return;

  const { default: jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  drawPdfCompany(doc, company);

  doc.setFontSize(11);
  doc.setFont(undefined, "normal");
  doc.text("PO Wise Report", 40, 40);

  doc.setFontSize(9);
  doc.text(`POs: ${rows.length}`, 40, 58);

  const cols = buildColumns(workType);
  const body = rows.map((r) => cols.map((c) => fmtPdf(c, c.v(r))));
  const footRow = cols.map((c, i) =>
    c.t ? fmtPdf(c, c.t(report.grandTotal)) : i === 0 ? "Grand Total" : ""
  );
  const columnStyles = {};
  cols.forEach((c, i) => {
    if (c.right) columnStyles[i] = { halign: "right" };
  });

  autoTable(doc, {
    head: [cols.map((c) => c.h)],
    body,
    foot: [footRow],
    startY: 72,
    margin: { left: 40, right: 40 },
    theme: "grid",
    styles: {
      fontSize: 7,
      cellPadding: 3,
      valign: "middle",
      lineColor: [0, 0, 0],
      lineWidth: 0.5,
      fillColor: false,
      textColor: 20,
    },
    headStyles: { fillColor: false, textColor: 20, fontStyle: "normal", lineWidth: 0.5 },
    footStyles: { fillColor: false, textColor: 20, fontStyle: "normal", lineWidth: 0.5 },
    alternateRowStyles: { fillColor: false },
    columnStyles,
  });

  doc.save(filename);
}
