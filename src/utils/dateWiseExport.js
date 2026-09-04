// Export helpers for the Date Wise Report.
// Mirrors the structure of absExport.js — Excel via SheetJS (xlsx),
// PDF via jspdf + jspdf-autotable.

import * as XLSX from "xlsx";
import { fmtNum, fmtDate } from "./format";

const HEADERS = [
  "PO",
  "Inv. No.",
  "Inv. Date",
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
];

function stamp() {
  return new Date().toISOString().slice(0, 10);
}

function rowToArray(r, idx, groupLabel) {
  return [
    idx === 0 ? groupLabel : "",
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
  ];
}

function subtotalToArray(label, t) {
  return [
    label,
    "",
    "",
    Number(t.qty) || 0,
    Number(t.basic) || 0,
    Number(t.gst) || 0,
    Number(t.tds) || 0,
    Number(t.roundOff) || 0,
    Number(t.grossValue) || 0,
    Number(t.matAdvance) || 0,
    Number(t.netReceivable) || 0,
    "",
    Number(t.paymentReceived) || 0,
    Number(t.balanceToReceive) || 0,
  ];
}

// ---------------------------------------------------------------------------
// Excel export
// ---------------------------------------------------------------------------

export function exportDateWiseReportToExcel(
  report,
  { dateLabel = "Invoice Date", filename = `Date-Wise-Report-${stamp()}.xlsx` } = {}
) {
  if (!report) return;

  const headers = [...HEADERS];
  headers[2] = dateLabel === "Payment Date" ? "Inv. Date" : "Inv. Date";

  const rows = [headers];

  report.days.forEach((d) => {
    d.rows.forEach((r, idx) => {
      rows.push(rowToArray(r, idx, fmtDate(d.date)));
    });
    rows.push(subtotalToArray(`Subtotal — ${fmtDate(d.date)}`, d.subtotal));
  });

  rows.push(subtotalToArray("Grand Total", report.grandTotal));

  if (report.pending && report.pending.length > 0) {
    rows.push([]);
    rows.push([`Pending / No ${dateLabel}`]);
    report.pending.forEach((r, idx) => {
      rows.push(rowToArray(r, idx, r.poCode));
    });
    rows.push(subtotalToArray("Pending Subtotal", report.pendingSubtotal));
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);

  ws["!cols"] = [
    { wch: 16 }, // Date / PO
    { wch: 14 }, // Inv No
    { wch: 12 }, // Inv Date
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
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Date Wise Report");
  XLSX.writeFile(wb, filename);
}

// ---------------------------------------------------------------------------
// PDF export
// ---------------------------------------------------------------------------

export async function exportDateWiseReportToPDF(
  report,
  {
    dateLabel = "Invoice Date",
    filename = `Date-Wise-Report-${stamp()}.pdf`,
  } = {}
) {
  if (!report) return;

  const { default: jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

  doc.setFontSize(11);
  doc.setFont(undefined, "normal");
  doc.text(`Date Wise Report — ${dateLabel}`, 40, 40);

  doc.setFontSize(9);
  doc.text(`Days: ${report.days.length}`, 40, 58);

  const body = [];
  report.days.forEach((d) => {
    d.rows.forEach((r, idx) => {
      body.push([
        idx === 0 ? fmtDate(d.date) : "",
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
      ]);
    });
    body.push([
      { content: `Subtotal — ${fmtDate(d.date)}`, colSpan: 3 },
      fmtNum(d.subtotal.qty, 1),
      fmtNum(d.subtotal.basic, 0),
      fmtNum(d.subtotal.gst, 0),
      fmtNum(d.subtotal.tds, 0),
      fmtNum(d.subtotal.roundOff, 2),
      fmtNum(d.subtotal.grossValue, 2),
      fmtNum(d.subtotal.matAdvance, 0),
      fmtNum(d.subtotal.netReceivable, 0),
      "",
      fmtNum(d.subtotal.paymentReceived, 0),
      fmtNum(d.subtotal.balanceToReceive, 0),
    ]);
  });

  if (report.pending && report.pending.length > 0) {
    report.pending.forEach((r, idx) => {
      body.push([
        idx === 0 ? `Pending / No ${dateLabel}` : "",
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
      ]);
    });
    body.push([
      { content: "Pending Subtotal", colSpan: 3 },
      fmtNum(report.pendingSubtotal.qty, 1),
      fmtNum(report.pendingSubtotal.basic, 0),
      fmtNum(report.pendingSubtotal.gst, 0),
      fmtNum(report.pendingSubtotal.tds, 0),
      fmtNum(report.pendingSubtotal.roundOff, 2),
      fmtNum(report.pendingSubtotal.grossValue, 2),
      fmtNum(report.pendingSubtotal.matAdvance, 0),
      fmtNum(report.pendingSubtotal.netReceivable, 0),
      "",
      fmtNum(report.pendingSubtotal.paymentReceived, 0),
      fmtNum(report.pendingSubtotal.balanceToReceive, 0),
    ]);
  }

  autoTable(doc, {
    head: [HEADERS],
    body,
    foot: [subtotalToArray("Grand Total", report.grandTotal).map((v) => String(v))],
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
      10: { halign: "right" },
      12: { halign: "right" },
      13: { halign: "right" },
    },
  });

  doc.save(filename);
}
