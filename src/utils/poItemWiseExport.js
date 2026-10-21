// Export helpers for the PO Item Wise Report (Excel via xlsx, PDF via jspdf).

import * as XLSX from "xlsx";
import { fmtNum, fmtDate, drawPdfCompany } from "./format";
import { ITEM_STATUS_LABELS } from "./poItemWiseReport";

function stamp() {
  return new Date().toISOString().slice(0, 10);
}

function headerFor(g) {
  return [
    "Sr",
    "Item Description",
    "Ordered (kg)",
    ...g.invoiceCols.map((c) => `${c.invoiceNo} (${fmtDate(c.invoiceDate)})`),
    "Billed (kg)",
    "Balance (kg)",
    "% Billed",
    "Value (Rs)",
    "Status",
  ];
}

function rowFor(g, r) {
  return [
    r.srNo,
    r.description,
    r.ordered,
    ...g.invoiceCols.map((c) => r.perInvoice[c.id] || 0),
    r.billed,
    r.balance,
    Math.round(r.pctBilled * 10) / 10,
    Math.round(r.value),
    ITEM_STATUS_LABELS[r.status] || r.status,
  ];
}

function totalFor(g) {
  const s = g.subtotal;
  return [
    "",
    "PO Total",
    s.ordered,
    ...g.invoiceCols.map((c) => s.perInvoice[c.id] || 0),
    s.billed,
    s.balance,
    Math.round(s.pctBilled * 10) / 10,
    Math.round(s.value),
    "",
  ];
}

export function exportPOItemWiseToExcel(report, filename = `PO-Item-Wise-Report-${stamp()}.xlsx`) {
  if (!report || report.groups.length === 0) return;

  const data = [];
  report.groups.forEach((g) => {
    data.push([`${g.poCode}${g.poNumber ? ` - PO No. ${g.poNumber}` : ""}`, "", `Rate: ${g.unitRate}/kg`]);
    data.push(headerFor(g));
    g.rows.forEach((r) => data.push(rowFor(g, r)));
    data.push(totalFor(g));
    data.push([]);
  });
  const t = report.grandTotal;
  data.push(["", "Grand Total", t.ordered, "Billed", t.billed, "Balance", t.balance, "Value", Math.round(t.value)]);

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = [{ wch: 14 }, { wch: 42 }, { wch: 13 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "PO Item Wise");
  XLSX.writeFile(wb, filename);
}

export async function exportPOItemWiseToPDF(report, { company, filename = `PO-Item-Wise-Report-${stamp()}.pdf` } = {}) {
  if (!report || report.groups.length === 0) return;

  const { default: jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  drawPdfCompany(doc, company);

  doc.setFontSize(11);
  doc.text("PO Item Wise Report", 40, 40);
  let y = 56;

  report.groups.forEach((g) => {
    doc.setFontSize(9);
    if (y > 520) {
      doc.addPage();
      y = 40;
    }
    doc.text(`${g.poCode}${g.poNumber ? ` - PO No. ${g.poNumber}` : ""}  |  Rate ${fmtNum(g.unitRate, 2)}/kg`, 40, y);

    const nInv = g.invoiceCols.length;
    const rightCols = {};
    for (let i = 2; i < 3 + nInv + 4; i++) rightCols[i] = { halign: "right" };

    autoTable(doc, {
      head: [headerFor(g)],
      body: g.rows.map((r) => {
        const a = rowFor(g, r);
        return a.map((v, i) => (typeof v === "number" && i >= 2 ? fmtNum(v, i === a.length - 2 ? 0 : 1) : String(v)));
      }),
      foot: [totalFor(g).map((v, i) => (typeof v === "number" && i >= 2 ? fmtNum(v, i === totalFor(g).length - 2 ? 0 : 1) : String(v)))],
      startY: y + 6,
      margin: { left: 40, right: 40 },
      theme: "grid",
      styles: { fontSize: 7, cellPadding: 3, lineColor: [0, 0, 0], lineWidth: 0.5, fillColor: false, textColor: 20 },
      headStyles: { fillColor: false, textColor: 20, fontStyle: "normal", lineWidth: 0.5 },
      footStyles: { fillColor: false, textColor: 20, fontStyle: "normal", lineWidth: 0.5 },
      columnStyles: rightCols,
    });
    y = doc.lastAutoTable.finalY + 24;
  });

  doc.save(filename);
}
