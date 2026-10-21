// Export helpers for the Pending Payments report (Excel via xlsx, PDF via jspdf).
// Columns match the on-screen table in PendingPayments.jsx.

import * as XLSX from "xlsx";
import { fmtNum, fmtDate, drawPdfCompany } from "./format";
import { PAYMENT_STATUS_LABELS } from "./pendingPaymentsReport";

const HEADERS = [
  "Bill No.",
  "Bill Date",
  "PO",
  "Gross Value",
  "Mat. Adv.",
  "TDS",
  "Net Recv.",
  "Paid",
  "Balance",
  "Days Due",
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
    fmtNum(r.grossValue, 2),
    fmtNum(r.matAdvance, 0),
    fmtNum(r.tds, 0),
    fmtNum(r.netReceivable, 0),
    fmtNum(r.paymentReceived, 0),
    fmtNum(r.balanceToReceive, 0),
    r.daysDue ?? "-",
    PAYMENT_STATUS_LABELS[r.paymentStatus] || r.paymentStatus,
  ];
}

function totalRow(t) {
  return [
    "Total Pending",
    "",
    "",
    fmtNum(t.grossValue, 2),
    fmtNum(t.matAdvance, 0),
    fmtNum(t.tds, 0),
    fmtNum(t.netReceivable, 0),
    fmtNum(t.paymentReceived, 0),
    fmtNum(t.balanceToReceive, 0),
    "",
    "",
  ];
}

export function exportPendingPaymentsToExcel(
  totals,
  rows,
  filename = `Pending-Payments-${stamp()}.xlsx`
) {
  const data = [HEADERS, ...rows.map(rowToArray), totalRow(totals)];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = [
    { wch: 12 },
    { wch: 12 },
    { wch: 16 },
    { wch: 13 },
    { wch: 11 },
    { wch: 10 },
    { wch: 13 },
    { wch: 12 },
    { wch: 12 },
    { wch: 10 },
    { wch: 15 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Pending Payments");
  XLSX.writeFile(wb, filename);
}

export async function exportPendingPaymentsToPDF(
  totals,
  rows,
  { company, filename = `Pending-Payments-${stamp()}.pdf` } = {}
) {
  const { default: jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  drawPdfCompany(doc, company);
  doc.setFontSize(11);
  doc.setFont(undefined, "normal");
  doc.text("Pending Payments Report", 40, 40);
  doc.setFontSize(9);
  doc.text(`Pending bills: ${rows.length}`, 40, 58);

  autoTable(doc, {
    head: [HEADERS],
    body: rows.map((r) => rowToArray(r).map((v) => String(v))),
    foot: [totalRow(totals)],
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
      8: { halign: "right" },
      9: { halign: "right" },
    },
  });

  doc.save(filename);
}
