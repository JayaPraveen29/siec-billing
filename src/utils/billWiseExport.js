// Export helpers for the Bill Wise Report.
// Columns here are kept in lockstep with the on-screen table in
// BillWiseReport.jsx — Excel via SheetJS (xlsx), PDF via jspdf + jspdf-autotable.

import * as XLSX from "xlsx";
import { fmtNum, fmtDate, drawPdfCompany } from "./format";
import { billWiseQtyColumns } from "./billWiseReport";

function stamp() {
  return new Date().toISOString().slice(0, 10);
}

// Column specs. `v` = row value, `t` = Grand Total value (omit for blank),
// `w` = Excel width, `right` = right-aligned in the PDF.
function buildColumns({ showArea = true, qtyCols } = {}) {
  const qc = qtyCols || billWiseQtyColumns("all");
  const cols = [
    { h: "Bill No.", v: (r) => r.billNo, t: () => "Grand Total", w: 12 },
    { h: "Bill Date", v: (r) => fmtDate(r.billDate), w: 12 },
    { h: "PO", v: (r) => r.poCode, w: 16 },
  ];
  if (showArea) cols.push({ h: "Area", v: (r) => r.area || "-", w: 18 });
  qc.forEach((c) =>
    cols.push({
      h: c.label,
      v: (r) => (r[c.key] > 0 ? fmtNum(r[c.key], c.type === "CT" ? 0 : 1) : "-"),
      t: (g) => fmtNum(g[c.key], c.type === "CT" ? 0 : 1),
      w: 12,
      right: true,
    })
  );
  cols.push(
    { h: "Gross Value", v: (r) => fmtNum(r.grossValue, 2), t: (g) => fmtNum(g.grossValue, 2), w: 13, right: true },
    { h: "Mat. Adv.", v: (r) => fmtNum(r.matAdvance, 0), t: (g) => fmtNum(g.matAdvance, 0), w: 11, right: true },
    { h: "TDS", v: (r) => fmtNum(r.tds, 0), t: (g) => fmtNum(g.tds, 0), w: 10, right: true },
    { h: "Net Recv.", v: (r) => fmtNum(r.netReceivable, 0), t: (g) => fmtNum(g.netReceivable, 0), w: 13, right: true },
    { h: "Payment Date", v: (r) => (r.paymentDate ? fmtDate(r.paymentDate) : "-"), w: 13 },
    { h: "Paid", v: (r) => fmtNum(r.paymentReceived, 0), t: (g) => fmtNum(g.paymentReceived, 0), w: 12, right: true },
    { h: "Balance", v: (r) => fmtNum(r.balanceToReceive, 0), t: (g) => fmtNum(g.balanceToReceive, 0), w: 12, right: true }
  );
  return cols;
}

// ---------------------------------------------------------------------------
// Excel export
// ---------------------------------------------------------------------------

export function exportBillWiseReportToExcel(
  report,
  rows,
  { showArea = true, qtyCols, filename = `Bill-Wise-Report-${stamp()}.xlsx` } = {}
) {
  if (!report) return;

  const cols = buildColumns({ showArea, qtyCols });
  const data = [cols.map((c) => c.h)];
  rows.forEach((r) => data.push(cols.map((c) => c.v(r))));
  data.push(cols.map((c) => (c.t ? c.t(report.grandTotal) : "")));

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = cols.map((c) => ({ wch: c.w }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Bill Wise Report");
  XLSX.writeFile(wb, filename);
}

// ---------------------------------------------------------------------------
// PDF export
// ---------------------------------------------------------------------------

export async function exportBillWiseReportToPDF(
  report,
  rows,
  { company, showArea = true, qtyCols, filename = `Bill-Wise-Report-${stamp()}.pdf` } = {}
) {
  if (!report) return;

  const { default: jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  drawPdfCompany(doc, company);

  doc.setFontSize(11);
  doc.setFont(undefined, "normal");
  doc.text("Bill Wise Report", 40, 40);

  doc.setFontSize(9);
  doc.text(`Bills: ${rows.length}`, 40, 58);

  const cols = buildColumns({ showArea, qtyCols });
  const body = rows.map((r) => cols.map((c) => String(c.v(r))));
  const footRow = cols.map((c) => (c.t ? String(c.t(report.grandTotal)) : ""));
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
