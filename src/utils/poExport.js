// Export helpers for the PO Billing Ledger page — mirrors the item matrix +
// invoice summary rows shown on screen (see POSheet.jsx).
//
// Excel export uses the `xlsx` (SheetJS) package — already a dependency
// of this project (see src/utils/excelImport.js).
//
// PDF export uses `jspdf` + `jspdf-autotable`, same as the ABS report
// export (see src/utils/absExport.js). It renders as ONE continuous table
// (header band + item rows + total row + summary rows), same as the
// on-screen table in POSheet.jsx, rather than two separate tables.

import * as XLSX from "xlsx";
import { fmtNum, fmtDate } from "./format";

// Same palette as src/styles/variables.css, used to color specific
// cells (Balance column, Net Receivable, Bal to be received) so the PDF
// matches the accent colors used on screen.
const COLOR_WARN = [194, 84, 47]; // --color-warn
const COLOR_OK = [79, 157, 105]; // --color-ok
const COLOR_RIVET2 = [172, 116, 26]; // darker print-safe version of --color-rivet2
const COLOR_MUTED = [110, 122, 133]; // --color-muted

function stamp() {
  return new Date().toISOString().slice(0, 10);
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// The same 12 summary-line definitions rendered below the item matrix on
// screen (see SUMMARY_ROW_DEFS in POSheet.jsx). Kept in sync manually since
// the page builds a couple of labels from the PO's live percentages.
function summaryRowDefs(po) {
  return [
    { no: 1, label: "Unit Rate", getVal: (r) => (r ? r.unitRate : null), decimals: 2, unitRateRow: true },
    { no: 2, label: "Basic Value", getVal: (r) => r?.basic, decimals: 2 },
    { no: 3, label: `GST @ ${po.gstPercent}%`, getVal: (r) => r?.gst, decimals: 2 },
    { no: 4, label: "Round Off", getVal: (r) => r?.roundOff, decimals: 2 },
    { no: 5, label: "Total Invoice Value", getVal: (r) => r?.totalInvoiceValue, bold: true },
    { no: 6, label: `Material Advance @ ${po.matAdvPercent}%`, getVal: (r) => r?.matAdvance },
    { no: 7, label: `TDS @ ${po.tdsPercent}%`, getVal: (r) => r?.tds },
    { no: 8, label: "Net Receivable", getVal: (r) => r?.netReceivable, bold: true, accentColor: COLOR_RIVET2 },
    { no: 9, label: "Bala. Mat. Advance", getVal: (r) => r?.matAdvanceBalance, totalMode: "last" },
    { no: 10, label: "Payment Date", getVal: (r) => r?.paymentDate, isDate: true },
    { no: 11, label: "Payment Amount", getVal: (r) => r?.paymentReceived },
    {
      no: 12,
      label: "Bal to be received",
      getVal: (r) => r?.balanceToReceive,
      accentFn: (v) => (v > 0.5 ? COLOR_WARN : COLOR_OK),
      totalMode: "last",
    },
  ];
}

// Builds the plain matrix (array-of-arrays) shared by both exporters:
// header row, item rows + total, blank spacer, then the invoice summary rows.
function buildMatrix(po, ledger) {
  const invoices = ledger.invoiceRows;
  const header = [
    "No.",
    "Description",
    "Wt./Kg",
    ...invoices.map((inv) => inv.invoiceNo || ""),
    "Bala/Total",
  ];

  const itemRows = ledger.itemRows.map((it) => [
    it.srNo,
    it.description,
    num(it.weightKg),
    ...invoices.map((inv) => num(inv.allocations?.[it.id])),
    num(it.balanceQty),
  ]);

  const totalRow = [
    "Total",
    "",
    num(ledger.totals.weightKg),
    ...invoices.map((inv) => num(inv.qty)),
    num(ledger.totals.balanceQty),
  ];

  const summaryHeaderRow = [
    "",
    "Total Weight",
    num(ledger.totals.weightKg),
    ...invoices.map((inv) => num(inv.qty)),
    num(ledger.totals.balanceQty),
  ];

  const defs = summaryRowDefs(po);
  const summaryRows = defs.map((def) => {
    let rowTotal = null;
    if (def.unitRateRow) {
      rowTotal = num(po.unitRate);
    } else if (!def.isDate) {
      if (def.totalMode === "last") {
        const lastInv = invoices[invoices.length - 1];
        rowTotal = num(def.getVal(lastInv));
      } else {
        rowTotal = invoices.reduce((sum, inv) => sum + num(def.getVal(inv)), 0);
      }
    }

    return {
      def,
      cells: [
        def.no,
        def.label,
        def.isDate ? "" : rowTotal,
        ...invoices.map((inv) => {
          const val = def.getVal(inv);
          return def.isDate ? fmtDate(val) : num(val);
        }),
        def.unitRateRow || def.isDate ? "" : rowTotal,
      ],
    };
  });

  return { header, itemRows, totalRow, summaryHeaderRow, summaryRows, invoices };
}

// ---------------------------------------------------------------------------
// Excel export
// ---------------------------------------------------------------------------

export function exportPOSheetToExcel(po, ledger, filename = `${po.code || "PO"}-Ledger-${stamp()}.xlsx`) {
  if (!po || !ledger) return;

  const { header, itemRows, totalRow, summaryHeaderRow, summaryRows } = buildMatrix(po, ledger);

  const rows = [
    [`PO Billing Ledger — ${po.code || ""} (${po.poNumber || ""})`],
    [`Unit Rate: ₹${fmtNum(po.unitRate, 2)}/kg   GST: ${po.gstPercent}%   Generated: ${new Date().toLocaleDateString("en-GB")}`],
    [],
    header,
    ...itemRows,
    totalRow,
    [],
    summaryHeaderRow,
    ...summaryRows.map((r) => r.cells),
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);

  const colCount = header.length;
  ws["!cols"] = [
    { wch: 8 },
    { wch: 26 },
    { wch: 12 },
    ...Array(Math.max(colCount - 4, 0)).fill({ wch: 13 }),
    { wch: 13 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "PO Ledger");
  XLSX.writeFile(wb, filename);
}

// ---------------------------------------------------------------------------
// PDF export
//
// Renders as ONE continuous table, matching the on-screen layout in
// POSheet.jsx:
//   - 3-row header band: No./Description/Wt.Kg (spanning), an "Invoice
//     Numbers" band spanning every invoice column, then a sub-row of
//     invoice dates.
//   - Item rows, "-" for zero/blank, Balance column colored warn/ok.
//   - A bold "Total" row (shaded, like the site's tfoot).
//   - A bold "Total Weight" summary-header row, then the 12 summary lines,
//     with "Total Invoice Value" / "Net Receivable" bold and the amber /
//     warn-ok accents from the site preserved.
// ---------------------------------------------------------------------------

export async function exportPOSheetToPDF(
  po,
  ledger,
  { filename = `${po.code || "PO"}-Ledger-${stamp()}.pdf` } = {}
) {
  if (!po || !ledger) return;

  const { default: jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const { itemRows, totalRow, summaryHeaderRow, summaryRows, invoices } = buildMatrix(po, ledger);

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

  doc.setFontSize(11);
  doc.setFont(undefined, "normal");
  doc.text(`PO Billing Ledger — ${po.code || ""} (${po.poNumber || ""})`, 40, 40);

  doc.setFontSize(9);
  doc.text(
    `Unit Rate: Rs.${fmtNum(po.unitRate, 2)}/kg   GST: ${po.gstPercent}%   TDS: ${po.tdsPercent}%   Mat. Adv.: ${po.matAdvPercent}%`,
    40,
    58
  );

  // Columns 0/1 (No. / Description) stay as-is; every other column is a
  // weight/qty/currency figure shown to N decimals, "-" when zero/blank —
  // same convention as the on-screen table (fmtNum + "-" fallback).
  const fmtCell = (v, decimals = 0) => {
    if (typeof v !== "number") return v || "-";
    return v ? fmtNum(v, decimals) : "-";
  };

  // ---- 3-row header band, mirroring the <thead> in POSheet.jsx ----
  const head = [
    [
      { content: "No.", rowSpan: 3 },
      { content: "Description", rowSpan: 3 },
      { content: "Wt./Kg", rowSpan: 3, styles: { halign: "right" } },
      ...(invoices.length > 0
        ? [{ content: "Invoice Numbers", colSpan: invoices.length, styles: { halign: "center" } }]
        : []),
      { content: "Bala/Total", rowSpan: 3, styles: { halign: "right" } },
    ],
    invoices.map((inv) => ({ content: inv.invoiceNo || "", styles: { halign: "right" } })),
    invoices.map((inv) => ({
      content: fmtDate(inv.invoiceDate),
      styles: { halign: "right", textColor: COLOR_MUTED, fontStyle: "normal" },
    })),
  ];

  // ---- Body: item rows, total row, summary-header row, summary rows,
  // all in one table, with a parallel `rowMeta` array (same length/order)
  // driving the per-row styling in didParseCell below. ----
  const body = [];
  const rowMeta = [];

  ledger.itemRows.forEach((it, i) => {
    body.push(itemRows[i].map((v, ci) => fmtCell(v, ci === 2 ? 2 : 2)));
    rowMeta.push({ type: "item", balanceColor: it.balanceQty > 0.001 ? COLOR_WARN : COLOR_OK });
  });

  body.push(totalRow.map((v, ci) => fmtCell(v, ci === 2 ? 2 : 2)));
  rowMeta.push({
    type: "total",
    bold: true,
    fill: true,
    balanceColor: ledger.totals.balanceQty > 0.001 ? COLOR_WARN : COLOR_OK,
  });

  body.push(summaryHeaderRow.map((v, ci) => fmtCell(v, ci === 2 ? 2 : 2)));
  rowMeta.push({ type: "summaryHeader", bold: true, fill: true });

  summaryRows.forEach((r) => {
    const { def } = r;
    const decimals = def.decimals ?? 0;
    body.push(
      r.cells.map((v, ci) => {
        if (ci === 0 || ci === 1) return v; // "#" / "Line Item"
        return def.isDate ? v || "-" : fmtCell(v, decimals);
      })
    );
    rowMeta.push({
      type: "summary",
      bold: !!def.bold,
      accentColor: def.accentColor || null,
      accentFn: def.accentFn || null,
      cells: r.cells,
    });
  });

  const rightAlignCols = {};
  itemRows[0]?.forEach((_, i) => {
    if (i >= 2) rightAlignCols[i] = { halign: "right" };
  });
  // Summary rows use the same column layout as the item matrix (No/Label
  // instead of No/Description in cols 0-1) so the same right-align map applies.

  const lastColIndex = 2 + invoices.length + 1;

  autoTable(doc, {
    head,
    body,
    startY: 74,
    margin: { left: 40, right: 40 },
    theme: "grid",
    styles: { fontSize: 7, cellPadding: 3, valign: "middle", lineColor: [0, 0, 0], lineWidth: 0.5, fillColor: false, textColor: 20 },
    headStyles: { fillColor: false, textColor: 20, fontStyle: "bold", lineWidth: 0.5 },
    alternateRowStyles: { fillColor: false },
    columnStyles: rightAlignCols,
    didParseCell(data) {
      if (data.section !== "body") return;
      const meta = rowMeta[data.row.index];
      if (!meta) return;

      if (meta.bold) data.cell.styles.fontStyle = "bold";

      // Balance/Total column on item + total rows: warn/ok accent.
      if ((meta.type === "item" || meta.type === "total") && data.column.index === lastColIndex) {
        data.cell.styles.textColor = meta.balanceColor;
      }

      // Summary rows: a fixed accent (e.g. Net Receivable) or a per-value
      // accentFn (e.g. Bal to be received), applied to every value column.
      if (meta.type === "summary" && data.column.index >= 2) {
        if (meta.accentColor) {
          data.cell.styles.textColor = meta.accentColor;
        } else if (meta.accentFn) {
          const raw = num(meta.cells[data.column.index]);
          data.cell.styles.textColor = meta.accentFn(raw);
        }
      }
    },
  });

  doc.save(filename);
}