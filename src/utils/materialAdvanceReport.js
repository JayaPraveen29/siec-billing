// Material Advance Report engine.
// One row per PO: how much material advance was given (opening), how much has
// been recovered through bills so far, and what balance is still to recover,
// alongside the PO's billing / receivable position.

import { computePOLedger } from "./ledger";

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

const MONEY_EPSILON = 1; // ₹ tolerance

export const STATUS_LABELS = {
  "fully-recovered": "Fully Recovered",
  "balance-pending": "Balance Pending",
  "over-recovered": "Over Recovered",
  "no-advance": "No Advance",
};

export function computeMaterialAdvanceReport(poSheets) {
  const rows = poSheets.map(({ po, items, invoices }) => {
    const ledger = computePOLedger(po, items, invoices);
    const { totals } = ledger;

    const openingAdvance = ledger.openingMatAdvance;
    const recovered = totals.matAdvance;
    const balanceAdvance = ledger.matAdvanceBalance;
    const pctRecovered = openingAdvance > 0 ? (recovered / openingAdvance) * 100 : 0;
    const qtyPct = totals.weightKg > 0 ? (totals.qty / totals.weightKg) * 100 : 0;

    const status =
      openingAdvance <= MONEY_EPSILON && recovered <= MONEY_EPSILON
        ? "no-advance"
        : balanceAdvance < -MONEY_EPSILON
        ? "over-recovered"
        : balanceAdvance <= MONEY_EPSILON
        ? "fully-recovered"
        : "balance-pending";

    return {
      poId: po.id,
      poCode: po.code,
      poNumber: po.poNumber,
      group: po.group || "",
      openingAdvance,
      recovered,
      balanceAdvance,
      pctRecovered,
      grossBilled: totals.basic + totals.gst + totals.roundOff,
      tds: totals.tds,
      netReceivable: totals.netReceivable,
      paymentReceived: totals.paymentReceived,
      balanceToReceive: totals.balanceToReceive,
      qtyPct,
      status,
    };
  });

  rows.sort((a, b) =>
    String(a.poCode ?? "").localeCompare(String(b.poCode ?? ""), undefined, {
      numeric: true,
      sensitivity: "base",
    })
  );

  return { rows };
}

/** Sum the money columns of whichever rows are currently shown. */
export function sumMaterialAdvanceRows(rows) {
  const t = rows.reduce(
    (a, r) => {
      a.openingAdvance += r.openingAdvance;
      a.recovered += r.recovered;
      a.balanceAdvance += r.balanceAdvance;
      a.grossBilled += r.grossBilled;
      a.tds += r.tds;
      a.netReceivable += r.netReceivable;
      a.paymentReceived += r.paymentReceived;
      a.balanceToReceive += r.balanceToReceive;
      return a;
    },
    {
      openingAdvance: 0,
      recovered: 0,
      balanceAdvance: 0,
      grossBilled: 0,
      tds: 0,
      netReceivable: 0,
      paymentReceived: 0,
      balanceToReceive: 0,
    }
  );
  t.pctRecovered = t.openingAdvance > 0 ? (t.recovered / t.openingAdvance) * 100 : 0;
  return t;
}

export function filterMaterialAdvanceRows(rows, { search, status }) {
  const term = (search || "").trim().toLowerCase();
  return rows.filter((r) => {
    if (term) {
      const hay = `${r.poCode} ${r.poNumber}`.toLowerCase();
      if (!hay.includes(term)) return false;
    }
    if (status && status !== "all" && r.status !== status) return false;
    return true;
  });
}
