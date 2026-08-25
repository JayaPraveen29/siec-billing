// Export helpers for the ABS (Abstract of Structural Bills) report.
//
// Excel export uses the `xlsx` (SheetJS) package — already a dependency
// of this project (see src/utils/excelImport.js).
//
// PDF export uses `jspdf` + `jspdf-autotable`. If they aren't installed yet, run:
//   npm install jspdf jspdf-autotable

import * as XLSX from "xlsx";
import { fmtNum, fmtDate } from "./format";

const HEADERS = [
  "PO",
  "Inv. No.",
  "Date",
  "Wt./Kg",
  "Basic",
  "GST",
  "TDS",
  "Round Off",
  "Gross Value",
  "Mat. Adv.",
  "Net Recv.",
  "Paid On",
  "Paid Amount",
  "Balance",
  "Days",
];

function stamp() {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Excel export
// ---------------------------------------------------------------------------

export function exportABSReportToExcel(report, filename = `ABS-Report-${stamp()}.xlsx`) {
  if (!report) return;

  const rows = [HEADERS];

  report.groups.forEach((g) => {
    g.rows.forEach((r, idx) => {
      rows.push([
        idx === 0 ? g.po.code : "",
        r.invoiceNo,
        fmtDate(r.invoiceDate),
        Number(r.qty) || 0,
        Number(r.basic) || 0,
        Number(r.gst) || 0,
        Number(r.tds) || 0,
        Number(r.roundOff) || 0,
        Number(r.grossValue) || 0,
        Number(r.matAdvance) || 0,
        Number(r.netReceivable) || 0,
        fmtDate(r.paymentDate),
        Number(r.paymentReceived) || 0,
        Number(r.balanceToReceive) || 0,
        r.days ?? "",
      ]);
    });

    rows.push([
      `Subtotal — ${g.po.code}`,
      "",
      "",
      Number(g.subtotal.qty) || 0,
      Number(g.subtotal.basic) || 0,
      Number(g.subtotal.gst) || 0,
      Number(g.subtotal.tds) || 0,
      Number(g.subtotal.roundOff) || 0,
      Number(g.subtotal.grossValue) || 0,
      Number(g.subtotal.matAdvance) || 0,
      Number(g.subtotal.netReceivable) || 0,
      "",
      Number(g.subtotal.paymentReceived) || 0,
      Number(g.subtotal.balanceToReceive) || 0,
      "",
    ]);
  });

  rows.push([
    "Grand Total",
    "",
    "",
    Number(report.grandTotal.qty) || 0,
    Number(report.grandTotal.basic) || 0,
    Number(report.grandTotal.gst) || 0,
    Number(report.grandTotal.tds) || 0,
    Number(report.grandTotal.roundOff) || 0,
    Number(report.grandTotal.grossValue) || 0,
    Number(report.grandTotal.matAdvance) || 0,
    Number(report.grandTotal.netReceivable) || 0,
    "",
    Number(report.grandTotal.paymentReceived) || 0,
    Number(report.grandTotal.balanceToReceive) || 0,
    "",
  ]);

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Reasonable column widths
  ws["!cols"] = [
    { wch: 16 }, // PO
    { wch: 14 }, // Inv No
    { wch: 12 }, // Date
    { wch: 10 }, // Wt/Kg
    { wch: 12 }, // Basic
    { wch: 10 }, // GST
    { wch: 10 }, // TDS
    { wch: 10 }, // Round Off
    { wch: 13 }, // Gross Value
    { wch: 11 }, // Mat Adv
    { wch: 13 }, // Net Recv
    { wch: 12 }, // Paid On
    { wch: 13 }, // Paid Amount
    { wch: 12 }, // Balance
    { wch: 8 }, // Days
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "ABS Report");
  XLSX.writeFile(wb, filename);
}

// ---------------------------------------------------------------------------
// PDF export
// ---------------------------------------------------------------------------

export async function exportABSReportToPDF(
  report,
  { filename = `ABS-Report-${stamp()}.pdf` } = {}
) {
  if (!report) return;

  const { default: jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFontSize(11);
  doc.setFont(undefined, "normal");
  doc.text("Abstract of Structural Bills", 40, 40);

  doc.setFontSize(9);
  doc.text(`PO Groups: ${report.groups.length}`, 40, 58);

  const body = [];
  report.groups.forEach((g) => {
    g.rows.forEach((r, idx) => {
      body.push([
        idx === 0 ? g.po.code : "",
        r.invoiceNo ?? "",
        fmtDate(r.invoiceDate),
        fmtNum(r.qty, 1),
        fmtNum(r.basic, 0),
        fmtNum(r.gst, 0),
        fmtNum(r.tds, 0),
        fmtNum(r.roundOff, 2),
        fmtNum(r.grossValue, 2),
        fmtNum(r.matAdvance, 0),
        fmtNum(r.netReceivable, 0),
        fmtDate(r.paymentDate),
        fmtNum(r.paymentReceived, 0),
        fmtNum(r.balanceToReceive, 0),
        r.days ?? "-",
      ]);
    });

    body.push([
      { content: `Subtotal — ${g.po.code}`, colSpan: 3 },
      fmtNum(g.subtotal.qty, 1),
      fmtNum(g.subtotal.basic, 0),
      fmtNum(g.subtotal.gst, 0),
      fmtNum(g.subtotal.tds, 0),
      fmtNum(g.subtotal.roundOff, 2),
      fmtNum(g.subtotal.grossValue, 2),
      fmtNum(g.subtotal.matAdvance, 0),
      fmtNum(g.subtotal.netReceivable, 0),
      "",
      fmtNum(g.subtotal.paymentReceived, 0),
      fmtNum(g.subtotal.balanceToReceive, 0),
      "",
    ]);
  });

  autoTable(doc, {
    head: [HEADERS],
    body,    foot: [
      [
        { content: "Grand Total", colSpan: 3 },
        fmtNum(report.grandTotal.qty, 1),
        fmtNum(report.grandTotal.basic, 0),
        fmtNum(report.grandTotal.gst, 0),
        fmtNum(report.grandTotal.tds, 0),
        fmtNum(report.grandTotal.roundOff, 2),
        fmtNum(report.grandTotal.grossValue, 2),
        fmtNum(report.grandTotal.matAdvance, 0),
        fmtNum(report.grandTotal.netReceivable, 0),
        "",
        fmtNum(report.grandTotal.paymentReceived, 0),
        fmtNum(report.grandTotal.balanceToReceive, 0),
        "",
      ],
    ],
    startY: 72,
    margin: { left: 40, right: 40 },
    theme: "grid",
    styles: { fontSize: 7, cellPadding: 3, valign: "middle", lineColor: [0, 0, 0], lineWidth: 0.5, fillColor: false, textColor: 20 },
    headStyles: { fillColor: false, textColor: 20, fontStyle: "normal", lineWidth: 0.5 },
    footStyles: { fillColor: false, textColor: 20, fontStyle: "normal", lineWidth: 0.5 },
    alternateRowStyles: { fillColor: false },
    columnStyles: {
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right" },
      6: { halign: "right" },
      7: { halign: "right" },
      8: { halign: "right" },
      9: { halign: "right" },
      10: { halign: "right" },
      12: { halign: "right" },
      13: { halign: "right" },
      14: { halign: "right" },
    },
  
  });

  doc.save(filename);
}