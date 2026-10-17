// Export helpers for the Material Advance Report (Excel via xlsx, PDF via jspdf).
// Columns match the on-screen table in MaterialAdvanceReport.jsx.

import * as XLSX from "xlsx";
import { fmtNum } from "./format";
import { STATUS_LABELS } from "./materialAdvanceReport";

const HEADERS = [
  "PO",
  "Group",
  "Opening Mat. Adv.",
  "Mat. Adv. Recovered",
  "Bala. Mat. Adv.",
  "% Recovered",
  "Gross Billed",
  "TDS",
  "Net Recv.",
  "Paid",
  "Balance to Receive",
  "Qty Billed %",
  "Status",
];

function stamp() {
  return new Date().toISOString().slice(0, 10);
}

function rowToArray(r) {
  return [
    r.poCode,
    r.group || "-",
    fmtNum(r.openingAdvance, 0),
    fmtNum(r.recovered, 0),
    fmtNum(r.balanceAdvance, 0),
    `${fmtNum(r.pctRecovered, 1)}%`,
    fmtNum(r.grossBilled, 0),
    fmtNum(r.tds, 0),
    fmtNum(r.netReceivable, 0),
    fmtNum(r.paymentReceived, 0),
    fmtNum(r.balanceToReceive, 0),
    `${fmtNum(r.qtyPct, 1)}%`,
    STATUS_LABELS[r.status] || r.status,
  ];
}

function totalRow(t) {
  return [
    "Grand Total",
    "",
    fmtNum(t.openingAdvance, 0),
    fmtNum(t.recovered, 0),
    fmtNum(t.balanceAdvance, 0),
    `${fmtNum(t.pctRecovered, 1)}%`,
    fmtNum(t.grossBilled, 0),
    fmtNum(t.tds, 0),
    fmtNum(t.netReceivable, 0),
    fmtNum(t.paymentReceived, 0),
    fmtNum(t.balanceToReceive, 0),
    "",
    "",
  ];
}

export function exportMaterialAdvanceToExcel(
  totals,
  rows,
  filename = `Material-Advance-Report-${stamp()}.xlsx`
) {
  const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...rows.map(rowToArray), totalRow(totals)]);
  ws["!cols"] = [
    { wch: 16 },
    { wch: 8 },
    { wch: 16 },
    { wch: 18 },
    { wch: 15 },
    { wch: 12 },
    { wch: 13 },
    { wch: 10 },
    { wch: 13 },
    { wch: 12 },
    { wch: 17 },
    { wch: 12 },
    { wch: 16 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Material Advance");
  XLSX.writeFile(wb, filename);
}

export async function exportMaterialAdvanceToPDF(
  totals,
  rows,
  { filename = `Material-Advance-Report-${stamp()}.pdf` } = {}
) {
  const { default: jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  doc.setFontSize(11);
  doc.setFont(undefined, "normal");
  doc.text("Material Advance Report", 40, 40);
  doc.setFontSize(9);
  doc.text(`POs: ${rows.length}`, 40, 58);

  autoTable(doc, {
    head: [HEADERS],
    body: rows.map((r) => rowToArray(r).map((v) => String(v))),
    foot: [totalRow(totals)],
    startY: 72,
    margin: { left: 30, right: 30 },
    theme: "grid",
    styles: {
      fontSize: 6.5,
      cellPadding: 2.5,
      valign: "middle",
      lineColor: [0, 0, 0],
      lineWidth: 0.5,
      fillColor: false,
      textColor: 20,
    },
    headStyles: { fillColor: false, textColor: 20, fontStyle: "normal", lineWidth: 0.5 },
    footStyles: { fillColor: false, textColor: 20, fontStyle: "normal", lineWidth: 0.5 },
    alternateRowStyles: { fillColor: false },
    columnStyles: Object.fromEntries(
      [2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => [i, { halign: "right" }])
    ),
  });

  doc.save(filename);
}
