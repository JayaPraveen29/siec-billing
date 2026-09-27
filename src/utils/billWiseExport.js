// Export helpers for the Bill Wise Report.
// Columns here are kept in lockstep with the on-screen table in
// BillWiseReport.jsx — Excel via SheetJS (xlsx), PDF via jspdf + jspdf-autotable.

import * as XLSX from "xlsx";
import { fmtNum, fmtDate } from "./format";
import { PAYMENT_STATUS_LABELS } from "./billWiseReport";

const HEADERS = [
  "Bill No.",
  "Bill Date",
  "PO",
  "Qty",
  "Gross Value",
  "Mat. Adv.",
  "TDS",
  "Net Recv.",
  "Payment Date",
  "Paid",
  "Balance",
  "Payment Status",
];

function stamp() {
  return new Date().toISOString().slice(0, 10);
}

function rowToArray(r) {
  return [
    r.billNo,
    fmtDate(r.billDate),
    r.poCode,
    fmtNum(r.qty, 1),
    fmtNum(r.grossValue, 2),
    fmtNum(r.matAdvance, 0),
    fmtNum(r.tds, 0),
    fmtNum(r.netReceivable, 0),
    r.paymentDate ? fmtDate(r.paymentDate) : "-",
    fmtNum(r.paymentReceived, 0),
    fmtNum(r.balanceToReceive, 0),
    PAYMENT_STATUS_LABELS[r.paymentStatus] || r.paymentStatus,
  ];
}

// ---------------------------------------------------------------------------
// Excel export
// ---------------------------------------------------------------------------

export function exportBillWiseReportToExcel(
  report,
  rows,
  filename = `Bill-Wise-Report-${stamp()}.xlsx`
) {
  if (!report) return;

  const data = [HEADERS];
  rows.forEach((r) => data.push(rowToArray(r)));

  data.push([
    "Grand Total",
    "",
    "",
    fmtNum(report.grandTotal.qty, 1),
    fmtNum(report.grandTotal.grossValue, 2),
    fmtNum(report.grandTotal.matAdvance, 0),
    fmtNum(report.grandTotal.tds, 0),
    fmtNum(report.grandTotal.netReceivable, 0),
    "",
    fmtNum(report.grandTotal.paymentReceived, 0),
    fmtNum(report.grandTotal.balanceToReceive, 0),
    "",
  ]);

  const ws = XLSX.utils.aoa_to_sheet(data);

  ws["!cols"] = [
    { wch: 12 }, // Bill No
    { wch: 12 }, // Bill Date
    { wch: 16 }, // PO
    { wch: 10 }, // Qty
    { wch: 13 }, // Gross Value
    { wch: 11 }, // Mat Adv
    { wch: 10 }, // TDS
    { wch: 13 }, // Net Recv
    { wch: 13 }, // Payment Date
    { wch: 12 }, // Paid
    { wch: 12 }, // Balance
    { wch: 15 }, // Payment Status
  ];

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
  { filename = `Bill-Wise-Report-${stamp()}.pdf` } = {}
) {
  if (!report) return;

  const { default: jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

  doc.setFontSize(11);
  doc.setFont(undefined, "normal");
  doc.text("Bill Wise Report", 40, 40);

  doc.setFontSize(9);
  doc.text(`Bills: ${rows.length}`, 40, 58);

  const body = rows.map((r) => rowToArray(r).map((v) => String(v)));

  autoTable(doc, {
    head: [HEADERS],
    body,
    foot: [
      [
        "Grand Total",
        "",
        "",
        fmtNum(report.grandTotal.qty, 1),
        fmtNum(report.grandTotal.grossValue, 2),
        fmtNum(report.grandTotal.matAdvance, 0),
        fmtNum(report.grandTotal.tds, 0),
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
      7: { halign: "right" },
      9: { halign: "right" },
      10: { halign: "right" },
    },
  });

  doc.save(filename);
}