// Date-wise report engine.
// Takes the same { po, items, invoices } aggregate used by the ABS report
// (see fetchAllPOData / computePOLedger) and re-groups every invoice row
// by calendar date instead of by PO — once for Invoice Date ("Billing")
// and once for Payment Date ("Receipts").

import { computePOLedger } from "./ledger";

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function dayKey(d) {
  if (!d) return null;
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10); // YYYY-MM-DD, sorts naturally
}

const emptyTotals = () => ({
  qty: 0,
  basic: 0,
  gst: 0,
  tds: 0,
  roundOff: 0,
  grossValue: 0,
  matAdvance: 0,
  netReceivable: 0,
  paymentReceived: 0,
  balanceToReceive: 0,
});

function addInto(acc, r) {
  acc.qty += r.qty;
  acc.basic += r.basic;
  acc.gst += r.gst;
  acc.tds += r.tds;
  acc.roundOff += r.roundOff;
  acc.grossValue += r.grossValue;
  acc.matAdvance += r.matAdvance;
  acc.netReceivable += r.netReceivable;
  acc.paymentReceived += r.paymentReceived;
  acc.balanceToReceive += r.balanceToReceive;
  return acc;
}

/**
 * Flatten every PO's invoices into one row list, with the ledger fields
 * already computed (mirrors computeABSReport's row shape).
 */
function flattenRows(poSheets) {
  const rows = [];
  poSheets.forEach(({ po, items, invoices }) => {
    const ledger = computePOLedger(po, items, invoices);
    ledger.invoiceRows.forEach((inv) => {
      rows.push({
        poId: po.id,
        poCode: po.code,
        invoiceNo: inv.invoiceNo,
        invoiceDate: inv.invoiceDate,
        qty: inv.qty,
        basic: inv.basic,
        gst: inv.gst,
        tds: inv.tds,
        roundOff: inv.roundOff,
        grossValue: inv.basic + inv.gst + inv.roundOff,
        matAdvance: inv.matAdvance,
        netReceivable: inv.netReceivable,
        paymentDate: inv.paymentDate,
        paymentReceived: inv.paymentReceived,
        balanceToReceive: inv.balanceToReceive,
        days: inv.days,
      });
    });
  });
  return rows;
}

/**
 * Group flattened rows by a given date field ("invoiceDate" or
 * "paymentDate") within an optional [fromDate, toDate] range
 * (inclusive, "YYYY-MM-DD" strings — pass null/"" for no bound).
 *
 * Rows with no value in the date field are excluded from the dated
 * groups and returned separately as `pending` (used for the Receipts
 * tab, where an invoice with no paymentDate simply hasn't been paid yet).
 */
export function computeDateWiseReport(poSheets, dateField, { fromDate, toDate } = {}) {
  const allRows = flattenRows(poSheets);

  const dated = [];
  const pending = [];

  allRows.forEach((r) => {
    const value = r[dateField];
    const key = dayKey(value);
    if (!key) {
      pending.push(r);
      return;
    }
    if (fromDate && key < fromDate) return;
    if (toDate && key > toDate) return;
    dated.push({ ...r, _dayKey: key });
  });

  const byDay = new Map();
  dated.forEach((r) => {
    if (!byDay.has(r._dayKey)) byDay.set(r._dayKey, []);
    byDay.get(r._dayKey).push(r);
  });

  const days = [...byDay.keys()]
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map((key) => {
      const rows = byDay.get(key);
      const subtotal = rows.reduce(addInto, emptyTotals());
      return { date: key, rows, subtotal };
    });

  const grandTotal = days.reduce((acc, d) => addInto(acc, d.subtotal), emptyTotals());

  const pendingSubtotal = pending.reduce(addInto, emptyTotals());

  return { days, grandTotal, pending, pendingSubtotal };
}
