// Bill Wise Report engine.
// Takes the same { po, items, invoices } aggregate used by the ABS/Date-wise/
// PO-wise reports (see fetchAllPOData) and flattens every invoice ("bill")
// across every PO into a single row list — one row per bill — so it can be
// filtered by bill number, bill date, PO and payment status.

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

const MONEY_EPSILON = 1; // ₹ tolerance for "fully paid"

/**
 * Qty columns shown for the Work Type filter: STRL / CT / SCRAP all together
 * on "All", or just the selected one.
 */
export function billWiseQtyColumns(workType) {
  const all = [
    { key: "qtyStrl", label: "STRL (kg)", type: "STRL" },
    { key: "qtyCt", label: "CT (Nos.)", type: "CT" },
    { key: "qtyScrap", label: "SCRAP (kg)", type: "SCRAP" },
  ];
  const one = all.filter((c) => c.type === workType);
  return one.length ? one : all;
}

/** Area column applies to Coal Tub bills: shown for the CT and All filters. */
export function billWiseShowArea(workType) {
  return workType === "CT" || !workType || workType === "all" || workType === "All" || workType === "none";
}

/**
 * Build one row per bill (invoice) across every PO sheet.
 * @param {Array} poSheets - [{ po, items, invoices }]
 */
export function computeBillWiseReport(poSheets) {
  const rows = [];

  poSheets.forEach(({ po, items, invoices }) => {
    const ledger = computePOLedger(po, items, invoices);
    const wt = po.workType === "CT" ? "CT" : po.workType === "SCRAP" ? "SCRAP" : "STRL";
    ledger.invoiceRows.forEach((inv) => {
      const paymentStatus =
        inv.balanceToReceive <= MONEY_EPSILON
          ? "fully-paid"
          : inv.paymentReceived <= MONEY_EPSILON
          ? "unpaid"
          : "partially-paid";

      // Coal Tub only: the area(s) of the items billed on this bill.
      const area =
        po.workType === "CT"
          ? [
              ...new Set(
                items
                  .filter((it) => num((inv.allocations || {})[it.id]) > 0)
                  .map((it) => String(it.area ?? "").trim())
                  .filter(Boolean)
              ),
            ].join(", ")
          : "";

      rows.push({
        poId: po.id,
        isCT: po.workType === "CT",
        area,
        poCode: po.code,
        poNumber: po.poNumber,
        billNo: inv.invoiceNo,
        billDate: inv.invoiceDate,
        qty: inv.qty,
        // Qty split by work type, so it's clear what the quantity is in.
        // CT is in Nos. (tubs); STRL / SCRAP are in kg. A PO with no work
        // type set is counted under STRL.
        qtyStrl: wt === "STRL" ? inv.qty : 0,
        qtyCt: wt === "CT" ? inv.qty : 0,
        qtyScrap: wt === "SCRAP" ? inv.qty : 0,
        workTypeKey: wt,
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
        paymentStatus,
      });
    });
  });

  // Sort by bill number, ascending (1, 2, 3 ... 10, 11). numeric:true makes
  // the comparison natural so "2" comes before "10", and "INV-2" before
  // "INV-10". Ties fall back to PO code, then bill date.
  rows.sort((a, b) => {
    const byBill = String(a.billNo ?? "").localeCompare(
      String(b.billNo ?? ""),
      undefined,
      { numeric: true, sensitivity: "base" }
    );
    if (byBill !== 0) return byBill;
    const byPo = String(a.poCode ?? "").localeCompare(
      String(b.poCode ?? ""),
      undefined,
      { numeric: true, sensitivity: "base" }
    );
    if (byPo !== 0) return byPo;
    const da = a.billDate ? new Date(a.billDate).getTime() : -Infinity;
    const db = b.billDate ? new Date(b.billDate).getTime() : -Infinity;
    return da - db;
  });

  const grandTotal = rows.reduce(
    (acc, r) => {
      acc.qty += r.qty;
      acc.qtyStrl += r.qtyStrl;
      acc.qtyCt += r.qtyCt;
      acc.qtyScrap += r.qtyScrap;
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
    },
    {
      qty: 0,
      qtyStrl: 0,
      qtyCt: 0,
      qtyScrap: 0,
      basic: 0,
      gst: 0,
      tds: 0,
      roundOff: 0,
      grossValue: 0,
      matAdvance: 0,
      netReceivable: 0,
      paymentReceived: 0,
      balanceToReceive: 0,
    }
  );

  return { rows, grandTotal };
}

export const PAYMENT_STATUS_LABELS = {
  "fully-paid": "Fully Paid",
  "partially-paid": "Partially Paid",
  unpaid: "Unpaid",
};

/**
 * Apply the report page's bill number / PO / bill date range / payment
 * status filters to the row list.
 * fromDate/toDate are "YYYY-MM-DD" strings (inclusive), or "" for no bound.
 */
export function filterBillWiseRows(
  rows,
  { search, fromDate, toDate, paymentStatus }
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
    if (
      paymentStatus &&
      paymentStatus !== "all" &&
      r.paymentStatus !== paymentStatus
    )
      return false;
    return true;
  });
}