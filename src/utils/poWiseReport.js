// PO Wise Report engine.
// Takes the same { po, items, invoices } aggregate used by the ABS/Date-wise
// reports (see fetchAllPOData) and reduces each PO down to a single summary
// row: quantity progress + financial progress, each tracked independently.

import { computePOLedger, CT_TUB_WEIGHT_KG } from "./ledger";

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

const QTY_EPSILON = 0.01; // kg tolerance for "fully billed"
const MONEY_EPSILON = 1; // ₹ tolerance for "fully paid"

/**
 * Build one summary row per PO sheet.
 * @param {Array} poSheets - [{ po, items, invoices }]
 */
export function computePOWiseReport(poSheets) {
  const rows = poSheets.map(({ po, items, invoices }) => {
    const ledger = computePOLedger(po, items, invoices);
    const { totals } = ledger;

    const weightOrdered = totals.weightKg;
    const weightBilled = totals.qty;
    const weightBalance = totals.balanceQty;
    // Coal Tub POs are quantified in Nos. (tubs); kg = Nos. x tub weight.
    // Other POs are already in kg and have no Nos.
    const isCT = po.workType === "CT";
    const kgFactor = isCT ? CT_TUB_WEIGHT_KG : 1;
    const nosOrdered = isCT ? weightOrdered : 0;
    const nosBilled = isCT ? weightBilled : 0;
    const nosBalance = isCT ? weightBalance : 0;
    const kgOrdered = weightOrdered * kgFactor;
    const kgBilled = weightBilled * kgFactor;
    const kgBalance = weightBalance * kgFactor;
    const pctComplete = weightOrdered > 0 ? (weightBilled / weightOrdered) * 100 : 0;

    const qtyStatus =
      weightOrdered <= 0
        ? "no-items"
        : weightBalance <= QTY_EPSILON
        ? "fully-billed"
        : weightBilled <= QTY_EPSILON
        ? "not-started"
        : "in-progress";

    const paymentStatus =
      invoices.length === 0
        ? "not-started"
        : totals.balanceToReceive <= MONEY_EPSILON
        ? "fully-paid"
        : totals.paymentReceived <= MONEY_EPSILON
        ? "unpaid"
        : "partially-paid";

    return {
      poId: po.id,
      poCode: po.code,
      poNumber: po.poNumber,
      unitRate: num(po.unitRate),
      invoiceCount: invoices.length,
      isCT,
      weightOrdered,
      weightBilled,
      weightBalance,
      nosOrdered,
      nosBilled,
      nosBalance,
      kgOrdered,
      kgBilled,
      kgBalance,
      pctComplete,
      qtyStatus,
      basic: totals.basic,
      gst: totals.gst,
      grossValue: totals.basic + totals.gst + totals.roundOff,
      matAdvance: totals.matAdvance,
      matAdvanceBalance: ledger.matAdvanceBalance,
      gstTds: totals.gstTds,
      tds: totals.tds,
      netReceivable: totals.netReceivable,
      paymentReceived: totals.paymentReceived,
      balanceToReceive: totals.balanceToReceive,
      paymentStatus,
    };
  });

  // Fully billed first, then partially billed (in progress), then not started.
  const QTY_ORDER = { "fully-billed": 0, "in-progress": 1, "not-started": 2, "no-items": 3 };
  rows.sort((a, b) => QTY_ORDER[a.qtyStatus] - QTY_ORDER[b.qtyStatus]);

  const grandTotal = rows.reduce(
    (acc, r) => {
      acc.weightOrdered += r.weightOrdered;
      acc.weightBilled += r.weightBilled;
      acc.weightBalance += r.weightBalance;
      acc.nosOrdered += r.nosOrdered;
      acc.nosBilled += r.nosBilled;
      acc.nosBalance += r.nosBalance;
      acc.kgOrdered += r.kgOrdered;
      acc.kgBilled += r.kgBilled;
      acc.kgBalance += r.kgBalance;
      acc.basic += r.basic;
      acc.gst += r.gst;
      acc.grossValue += r.grossValue;
      acc.matAdvance += r.matAdvance;
      acc.gstTds += r.gstTds;
      acc.tds += r.tds;
      acc.netReceivable += r.netReceivable;
      acc.paymentReceived += r.paymentReceived;
      acc.balanceToReceive += r.balanceToReceive;
      return acc;
    },
    {
      weightOrdered: 0,
      weightBilled: 0,
      weightBalance: 0,
      nosOrdered: 0,
      nosBilled: 0,
      nosBalance: 0,
      kgOrdered: 0,
      kgBilled: 0,
      kgBalance: 0,
      basic: 0,
      gst: 0,
      grossValue: 0,
      matAdvance: 0,
      gstTds: 0,
      tds: 0,
      netReceivable: 0,
      paymentReceived: 0,
      balanceToReceive: 0,
    }
  );

  return { rows, grandTotal };
}

/**
 * Which columns the report shows for the selected Work Type filter.
 *  - "CT"            -> Coal Tub columns only: quantities in Nos. and kg,
 *                       GST TDS @2%, no Material Advance.
 *  - "all" / "none"  -> every column (Mat. Adv. and GST TDS both shown).
 *  - STRL / SCRAP    -> kg columns + Mat. Adv., no CT-only GST TDS.
 */
export function getPOWiseColumnConfig(workType) {
  const isCT = workType === "CT";
  const isAll = !workType || workType === "all" || workType === "All" || workType === "none";
  return {
    isCT,
    showNos: isCT || isAll, // Coal Tub quantities in Nos.
    showMatAdv: !isCT,
    showGstTds: isCT || isAll,
  };
}

export const QTY_STATUS_LABELS = {
  "fully-billed": "Fully Billed",
  "in-progress": "In Progress",
  "not-started": "Not Started",
  "no-items": "No Items",
};

export const PAYMENT_STATUS_LABELS = {
  "fully-paid": "Fully Paid",
  "partially-paid": "Partially Paid",
  unpaid: "Unpaid",
  "not-started": "Not Started",
};

/**
 * Apply the report page's search text + status filters to the row list.
 */
export function filterPOWiseRows(rows, { search, qtyStatus, paymentStatus }) {
  const term = (search || "").trim().toLowerCase();
  return rows.filter((r) => {
    if (term) {
      const hay = `${r.poCode} ${r.poNumber}`.toLowerCase();
      if (!hay.includes(term)) return false;
    }
    if (qtyStatus && qtyStatus !== "all" && r.qtyStatus !== qtyStatus) return false;
    if (paymentStatus && paymentStatus !== "all" && r.paymentStatus !== paymentStatus)
      return false;
    return true;
  });
}
