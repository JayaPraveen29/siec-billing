// Parses a PO sheet (in the "127-57452" style template) out of an uploaded
// .xlsx workbook and returns plain-JS items/invoices ready to feed into
// addItemsBulk() / addInvoice() from poService.
//
// Expected layout (matches the original spreadsheets):
//   B2            PO No.
//   M2            Opening Material Advance
//   Row 4         Invoice numbers, starting at column D
//   Row 5         Invoice dates,   starting at column D
//   Rows 6..N     Items: A=Sr.No, B=Description, C=Wt/Kg, D..=qty billed per invoice
//   Row N (SUM)   Totals row — column C holds a SUM() formula; this marks the end of items
//   Below that    Summary rows incl. "Unit Rate", "GST @ x%", "TDS @ x%",
//                 "Material Advance @ x%", "Payment received" — read by label match,
//                 not fixed row numbers, so the parser tolerates extra/missing rows.
//
// Requires the `xlsx` (SheetJS) package: npm install xlsx

import * as XLSX from "xlsx";

const COL_START = 4; // column D (A=1, B=2, C=3, D=4, ...)
const ITEM_START_ROW = 6;
const MAX_SCAN_ROW = 500;
const MAX_INVOICE_COLS = 60;

function colLetter(idx) {
  let s = "";
  while (idx > 0) {
    const rem = (idx - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    idx = Math.floor((idx - 1) / 26);
  }
  return s;
}

function cellAt(ws, row, col) {
  return ws[`${colLetter(col)}${row}`];
}

function excelSerialToIso(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return "";
}

/** Read a File/Blob into a SheetJS workbook. */
export async function readWorkbook(file) {
  const buf = await file.arrayBuffer();
  return XLSX.read(buf, { type: "array", cellDates: true, cellFormula: true });
}

/** Sheet names likely to contain PO data (excludes an "ABS" abstract/summary tab). */
export function listDataSheetNames(workbook) {
  return workbook.SheetNames.filter((n) => !/^abs$/i.test(n.trim()));
}

/**
 * Parse one PO sheet out of a workbook.
 * Returns { poNumber, openingMatAdvance, unitRate, gstPercent, tdsPercent,
 *           matAdvPercent, items[], invoices[] }
 * - items:    [{ srNo, description, weightKg }]
 * - invoices: [{ invoiceNo, invoiceDate, paymentReceived, allocationsByItemSrNo }]
 */
export function parsePOSheet(workbook, sheetName) {
  const ws = workbook.Sheets[sheetName];
  if (!ws) throw new Error(`Sheet "${sheetName}" not found in workbook`);

  const poNumberCell = cellAt(ws, 2, 2); // B2
  const poNumber = poNumberCell?.v !== undefined ? String(poNumberCell.v).trim() : "";

  const openingMatAdvanceCell = cellAt(ws, 2, 13); // M2
  const openingMatAdvance = openingMatAdvanceCell ? Number(openingMatAdvanceCell.v) || 0 : 0;

  // --- Invoice header: numbers (row 4) + dates (row 5), left-to-right from column D ---
  const invoiceCols = [];
  for (let col = COL_START; col < COL_START + MAX_INVOICE_COLS; col++) {
    const numCell = cellAt(ws, 4, col);
    if (!numCell || numCell.v === undefined || numCell.v === "") break;
    const dateCell = cellAt(ws, 5, col);
    invoiceCols.push({
      col,
      invoiceNo: String(numCell.v).trim(),
      invoiceDate: excelSerialToIso(dateCell?.v),
    });
  }
  if (invoiceCols.length === 0) {
    throw new Error("No invoice numbers found in row 4 — check the sheet layout.");
  }

  // --- Item rows: stop at the first row whose column C is a formula (the SUM totals row) ---
  const items = [];
  let row = ITEM_START_ROW;
  while (row < MAX_SCAN_ROW) {
    const cCell = cellAt(ws, row, 3);
    if (!cCell) break;
    if (cCell.f) break; // formula => totals row reached, items are done

    const bCell = cellAt(ws, row, 2);
    if (!bCell || bCell.v === undefined || bCell.v === "") {
      row++;
      continue;
    }

    const aCell = cellAt(ws, row, 1);
    const srNo = aCell?.v !== undefined ? String(aCell.v).trim() : String(items.length + 1);
    const description = String(bCell.v).trim();
    const weightKg = Number(cCell.v) || 0;

    const allocations = {}; // invoiceNo -> qty, remapped to item ids by the caller
    invoiceCols.forEach(({ col, invoiceNo }) => {
      const qtyCell = cellAt(ws, row, col);
      const qty = qtyCell ? Number(qtyCell.v) || 0 : 0;
      if (qty > 0) allocations[invoiceNo] = qty;
    });

    items.push({ srNo, description, weightKg, allocations });
    row++;
  }
  if (items.length === 0) {
    throw new Error(`No item rows found starting at row ${ITEM_START_ROW}.`);
  }

  // --- Summary rows below the items: find by label text in column B, not fixed row numbers ---
  let unitRate = 0;
  let gstPercent = 18;
  let tdsPercent = 0.1;
  let matAdvPercent = 20;
  let paymentRow = null;
  let matAdvRow = null;
  let tdsRow = null;

  for (let r = row; r < row + 20 && r < MAX_SCAN_ROW; r++) {
    const labelCell = cellAt(ws, r, 2);
    if (!labelCell || typeof labelCell.v !== "string") continue;
    const label = labelCell.v.trim();
    const lower = label.toLowerCase();

    if (lower.includes("unit rate")) {
      const rateCell = cellAt(ws, r, 3);
      unitRate = rateCell ? Number(rateCell.v) || 0 : 0;
    }
    const gstMatch = label.match(/gst\s*@\s*([\d.]+)\s*%/i);
    if (gstMatch) gstPercent = Number(gstMatch[1]);

    const tdsMatch = label.match(/tds\s*@\s*([\d.]+)\s*%/i);
    if (tdsMatch) {
      tdsPercent = Number(tdsMatch[1]);
      tdsRow = r;
    }

    const advMatch = label.match(/material advance\s*@\s*([\d.]+)\s*%/i);
    if (advMatch) {
      matAdvPercent = Number(advMatch[1]);
      matAdvRow = r;
    }

    if (lower.includes("payment received")) paymentRow = r;
  }

  const paymentByInvoiceNo = {};
  if (paymentRow) {
    invoiceCols.forEach(({ col, invoiceNo }) => {
      const cell = cellAt(ws, paymentRow, col);
      const val = cell ? Number(cell.v) || 0 : 0;
      if (val) paymentByInvoiceNo[invoiceNo] = val;
    });
  }

  // Detect manual overrides in the Material Advance / TDS rows. A cell driven
  // by a formula (cell.f) is auto-calculated the same way the app calculates
  // it, so no override is needed. A plain literal number in that row is a
  // manual override (e.g. a closing invoice with a hand-typed advance
  // adjustment). A cell left completely blank where its neighbours all have
  // formulas means TDS was deliberately skipped for that invoice — treat
  // that as an explicit override of 0 rather than letting the app compute it.
  function readOverrideRow(sourceRow, { blankMeansZero }) {
    const overrides = {};
    if (!sourceRow) return overrides;
    invoiceCols.forEach(({ col, invoiceNo }) => {
      const cell = cellAt(ws, sourceRow, col);
      if (!cell || cell.v === undefined || cell.v === "") {
        if (blankMeansZero) overrides[invoiceNo] = 0;
        return;
      }
      if (cell.f) return; // formula-driven, matches the app's own calculation
      const val = Number(cell.v);
      if (Number.isFinite(val)) overrides[invoiceNo] = val;
    });
    return overrides;
  }

  const matAdvOverrideByInvoiceNo = readOverrideRow(matAdvRow, { blankMeansZero: false });
  const tdsOverrideByInvoiceNo = readOverrideRow(tdsRow, { blankMeansZero: true });

  const invoices = invoiceCols.map(({ invoiceNo, invoiceDate }) => ({
    invoiceNo,
    invoiceDate,
    paymentReceived: paymentByInvoiceNo[invoiceNo] || 0,
    matAdvanceOverride: matAdvOverrideByInvoiceNo[invoiceNo],
    tdsOverride: tdsOverrideByInvoiceNo[invoiceNo],
    allocationsByItemSrNo: items.reduce((acc, it) => {
      if (it.allocations[invoiceNo]) acc[it.srNo] = it.allocations[invoiceNo];
      return acc;
    }, {}),
  }));

  return {
    poNumber,
    openingMatAdvance,
    unitRate,
    gstPercent,
    tdsPercent,
    matAdvPercent,
    items: items.map(({ srNo, description, weightKg }) => ({ srNo, description, weightKg })),
    invoices,
  };
}