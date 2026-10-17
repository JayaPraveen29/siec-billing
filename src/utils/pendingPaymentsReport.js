// Pending Payments report engine.
// Flattens every invoice across every PO (same source as the Bill Wise
// report) and keeps only the bills that still have money to receive, along
// with how many days each one has been outstanding.

import { computePOLedger } from "./ledger";

const MONEY_EPSILON = 1; // ₹ tolerance — balance within this counts as settled

function dayKey(d) {
  if (!d) return null;
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

// Days from bill date to today. Counted inclusively (bill day = day 1) so it
// matches the "Days" column on the PO sheet, which also adds 1.
function daysDue(billDate) {
  if (!billDate) return null;
  const start = new Date(billDate);
  if (Number.isNaN(start.getTime())) return null;
  const today = new Date();
  const a = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const b = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.max(0, Math.round((b - a) / 86400000) + 1);
}

export const PAYMENT_STATUS_LABELS = {
  "partially-paid": "Partially Paid",
  unpaid: "Unpaid",
};

export const AGE_BUCKETS = [
  { value: "all", label: "All Days Due" },
  { value: "0-30", label: "0 – 30 days" },
  { value: "31-60", label: "31 – 60 days" },
  { value: "61-90", label: "61 – 90 days" },
  { value: "90+", label: "Over 90 days" },
];

export function ageClass(days) {
  if (days == null) return "";
  if (days > 90) return "age-90";
  if (days > 60) return "age-60";
  if (days > 30) return "age-30";
  return "";
}

function inBucket(days, bucket) {
  if (days == null) return false;
  switch (bucket) {
    case "0-30":
      return days <= 30;
    case "31-60":
      return days >= 31 && days <= 60;
    case "61-90":
      return days >= 61 && days <= 90;
    case "90+":
      return days > 90;
    default:
      return true;
  }
}

/**
 * Build one row per unpaid / part-paid bill, oldest (most days due) first.
 * @param {Array} poSheets - [{ po, items, invoices }]
 */
export function computePendingPaymentsReport(poSheets) {
  const rows = [];

  poSheets.forEach(({ po, items, invoices }) => {
    const ledger = computePOLedger(po, items, invoices);
    ledger.invoiceRows.forEach((inv) => {
      if (!(inv.balanceToReceive > MONEY_EPSILON)) return;

      rows.push({
        poId: po.id,
        poCode: po.code,
        poNumber: po.poNumber,
        billNo: inv.invoiceNo,
        billDate: inv.invoiceDate,
        qty: inv.qty,
        grossValue: inv.basic + inv.gst + inv.roundOff,
        matAdvance: inv.matAdvance,
        tds: inv.tds,
        netReceivable: inv.netReceivable,
        paymentDate: inv.paymentDate,
        paymentReceived: inv.paymentReceived,
        balanceToReceive: inv.balanceToReceive,
        daysDue: daysDue(inv.invoiceDate),
        paymentStatus:
          inv.paymentReceived <= MONEY_EPSILON ? "unpaid" : "partially-paid",
      });
    });
  });

  rows.sort((a, b) => (b.daysDue ?? -1) - (a.daysDue ?? -1));

  return { rows };
}

/** Sum the money columns of whichever rows are currently shown. */
export function sumPendingRows(rows) {
  return rows.reduce(
    (acc, r) => {
      acc.qty += r.qty;
      acc.grossValue += r.grossValue;
      acc.matAdvance += r.matAdvance;
      acc.tds += r.tds;
      acc.netReceivable += r.netReceivable;
      acc.paymentReceived += r.paymentReceived;
      acc.balanceToReceive += r.balanceToReceive;
      return acc;
    },
    {
      qty: 0,
      grossValue: 0,
      matAdvance: 0,
      tds: 0,
      netReceivable: 0,
      paymentReceived: 0,
      balanceToReceive: 0,
    }
  );
}

/**
 * Filters: search (bill no / PO), bill-date range, payment status, days-due bucket.
 */
export function filterPendingRows(
  rows,
  { search, fromDate, toDate, paymentStatus, ageBucket }
) {
  const term = (search || "").trim().toLowerCase();
  return rows.filter((r) => {
    if (term) {
      const hay = `${r.billNo} ${r.poCode} ${r.poNumber}`.toLowerCase();
      if (!hay.includes(term)) return false;
    }
    if (fromDate || toDate) {
      const key = dayKey(r.billDate);
      if (!key) return false;
      if (fromDate && key < fromDate) return false;
      if (toDate && key > toDate) return false;
    }
    if (paymentStatus && paymentStatus !== "all" && r.paymentStatus !== paymentStatus)
      return false;
    if (ageBucket && ageBucket !== "all" && !inBucket(r.daysDue, ageBucket))
      return false;
    return true;
  });
}
