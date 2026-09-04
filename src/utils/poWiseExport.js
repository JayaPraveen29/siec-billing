// Export helpers for the PO Wise Report.
// Mirrors absExport.js / dateWiseExport.js — Excel via SheetJS (xlsx),
// PDF via jspdf + jspdf-autotable.

import * as XLSX from "xlsx";
import { fmtNum } from "./format";
import { QTY_STATUS_LABELS, PAYMENT_STATUS_LABELS } from "./poWiseReport";

const HEADERS = [
  "PO Code",
  "PO No.",
  "Invoices",
  "Wt. Ordered",
  "Wt. Billed",
  "Wt. Balance",
  "% Complete",
  "Qty Status",
  "Basic",
  "GST",
  "Gross Value",
  "Mat. Adv.",
  "TDS",
  "Net Recv.",
  "Paid Amount",
  "Balance",
  "Payment Status",
];

function stamp() {
  return new Date().toISOString().slice(0, 10);
}

function rowToArray(r) {
  return [
    r.poCode,
    r.poNumber,
    r.invoiceCount,
    Number(r.weightOrdered) || 0,
    Number(r.weightBilled) || 0,
    Number(r.weightBalance) || 0,
    `${fmtNum(r.pctComplete, 0)}%`,
    QTY_STATUS_LABELS[r.qtyStatus] || r.qtyStatus,
    Number(r.basic) || 0,
    Number(r.gst) || 0,
    Number(r.grossValue) || 0,
    Number(r.matAdvance) || 0,
    Number(r.tds) || 0,
    Number(r.netReceivable) || 0,
    Number(r.paymentReceived) || 0,
    Number(r.balanceToReceive) || 0,
    PAYMENT_STATUS_LABELS[r.paymentStatus] || r.paymentStatus,
  ];
}

// ---------------------------------------------------------------------------
// Excel export
// ---------------------------------------------------------------------------

export function exportPOWiseReportToExcel(
  report,
  rows,
  filename = `PO-Wise-Report-${stamp()}.xlsx`
) {
  if (!report) return;

  const data = [HEADERS];
  rows.forEach((r) => data.push(rowToArray(r)));

  data.push([
    "Grand Total",
    "",
    "",
    Number(report.grandTotal.weightOrdered) || 0,
    Number(report.grandTotal.weightBilled) || 0,
    Number(report.grandTotal.weightBalance) || 0,
    "",
    "",
    Number(report.grandTotal.basic) || 0,
    Number(report.grandTotal.gst) || 0,
    Number(report.grandTotal.grossValue) || 0,
    Number(report.grandTotal.matAdvance) || 0,
    Number(report.grandTotal.tds) || 0,
    Number(report.grandTotal.netReceivable) || 0,
    Number(report.grandTotal.paymentReceived) || 0,
    Number(report.grandTotal.balanceToReceive) || 0,
    "",
  ]);

  const ws = XLSX.utils.aoa_to_sheet(data);

  ws["!cols"] = [
    { wch: 16 }, // PO Code
    { wch: 12 }, // PO No
    { wch: 9 }, // Invoices
    { wch: 12 }, // Wt Ordered
    { wch: 11 }, // Wt Billed
    { wch: 12 }, // Wt Balance
    { wch: 11 }, // % Complete
    { wch: 13 }, // Qty Status
    { wch: 12 }, // Basic
    { wch: 10 }, // GST
    { wch: 13 }, // Gross Value
    { wch: 11 }, // Mat Adv
    { wch: 10 }, // TDS
    { wch: 13 }, // Net Recv
    { wch: 13 }, // Paid Amount
    { wch: 12 }, // Balance
    { wch: 15 }, // Payment Status
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "PO Wise Report");
  XLSX.writeFile(wb, filename);
}

// ---------------------------------------------------------------------------
// PDF export
// ---------------------------------------------------------------------------

export async function exportPOWiseReportToPDF(
  report,
  rows,
  { filename = `PO-Wise-Report-${stamp()}.pdf` } = {}
) {
  if (!report) return;

  const { default: jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

  doc.setFontSize(11);
  doc.setFont(undefined, "normal");
  doc.text("PO Wise Report", 40, 40);

  doc.setFontSize(9);
  doc.text(`POs: ${rows.length}`, 40, 58);

  const body = rows.map((r) => rowToArray(r).map((v) => String(v)));

  autoTable(doc, {
    head: [HEADERS],
    body,
    foot: [
      [
        "Grand Total",
        "",
        "",
        fmtNum(report.grandTotal.weightOrdered, 1),
        fmtNum(report.grandTotal.weightBilled, 1),
        fmtNum(report.grandTotal.weightBalance, 1),
        "",
        "",
        fmtNum(report.grandTotal.basic, 0),
        fmtNum(report.grandTotal.gst, 0),
        fmtNum(report.grandTotal.grossValue, 2),
        fmtNum(report.grandTotal.matAdvance, 0),
        fmtNum(report.grandTotal.tds, 0),
        fmtNum(report.grandTotal.netReceivable, 0),
        fmtNum(report.grandTotal.paymentReceived, 0),
        fmtNum(report.grandTotal.balanceToReceive, 0),
        "",
      ],
    ],
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
    columnStyles: {
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right" },
      6: { halign: "right" },
      8: { halign: "right" },
      9: { halign: "right" },
      10: { halign: "right" },
      11: { halign: "right" },
      12: { halign: "right" },
      13: { halign: "right" },
      14: { halign: "right" },
      15: { halign: "right" },
    },
  });

  doc.save(filename);
}
