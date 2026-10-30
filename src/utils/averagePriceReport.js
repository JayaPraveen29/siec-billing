// Average Price Report engine.
// One row per PO (all of the PO's items rolled together; `section` holds the
// PO number). Everything is based on what was ORDERED - no invoice values:
//   Weight / Rate / Basic  -> sum of item weights, PO rate in Rs/MT, and
//                             weight x rate (Basic = before GST)
//   SIEC / ST              -> the same MT / Basic / Rate/MT, placed under the
//                             company group the PO belongs to
//   Totals                 -> Total MT, Total Basic, Avg Rate (= Basic / MT)

import { PO_GROUPS } from "./groups";
import { inFinancialYear } from "./financialYear";

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

const emptyBucket = () => ({ mt: 0, value: 0 });

/**
 * @param {Array} poSheets - [{ po, items, invoices }]
 * @param {{ fy?: string|number }} [opts] - fy: "all" or an FY start year.
 *   With an FY selected, only POs that have an invoice dated inside that
 *   financial year are listed (the figures themselves are the PO's ordered
 *   values, not invoice values).
 */
export function computeAveragePriceReport(poSheets, { fy = "all" } = {}) {
  const map = new Map();

  poSheets.forEach(({ po, items, invoices }) => {
    const fyInvoices = (invoices || []).filter((inv) =>
      inFinancialYear(inv.invoiceDate, fy)
    );
    if (fy !== "all" && fyInvoices.length === 0) return;
    const unitRate = num(po.unitRate);
    const bucketKey = PO_GROUPS.includes(po.group) ? po.group : "other";

    // One row per PO: every item of the PO is rolled into that PO's row.
    const buckets = { other: emptyBucket() };
    PO_GROUPS.forEach((g) => (buckets[g] = emptyBucket()));
    const row = {
      poId: po.id,
      section: String(po.poNumber || po.code || po.id).trim(),
      weightMT: 0,
      basic: 0,
      buckets,
    };

    (items || []).forEach((item) => {
      const ordered = num(item.weightKg);
      row.weightMT += ordered / 1000;
      row.basic += ordered * unitRate; // ordered kg x PO rate (Rs/kg)
    });

    // Ordered MT / Basic go under the PO's own group (SIEC or ST).
    row.buckets[bucketKey].mt = row.weightMT;
    row.buckets[bucketKey].value = row.basic;

    map.set(po.id, row);
  });

  const rows = [...map.values()]
    .map((r) => finish(r))
    .sort((a, b) =>
      a.section.localeCompare(b.section, undefined, { numeric: true, sensitivity: "base" })
    );

  return { rows, grandTotal: sumAveragePriceRows(rows) };
}

function finish(r) {
  const out = {
    poId: r.poId,
    section: r.section,
    weightMT: r.weightMT,
    basic: r.basic,
    rate: r.weightMT > 0 ? r.basic / r.weightMT : 0, // Rs / MT
    buckets: r.buckets,
  };
  let mt = 0;
  let value = 0;
  Object.values(r.buckets).forEach((b) => {
    mt += b.mt;
    value += b.value;
  });
  out.totalMT = mt;
  out.totalValue = value;
  out.avgRate = mt > 0 ? value / mt : 0;
  return out;
}

/** Sum a list of rows (used for the Grand Total of whatever is visible). */
export function sumAveragePriceRows(rows) {
  const acc = { section: "Grand Total", weightMT: 0, basic: 0, buckets: { other: emptyBucket() } };
  PO_GROUPS.forEach((g) => (acc.buckets[g] = emptyBucket()));
  rows.forEach((r) => {
    acc.weightMT += r.weightMT;
    acc.basic += r.basic;
    Object.keys(acc.buckets).forEach((k) => {
      acc.buckets[k].mt += r.buckets[k].mt;
      acc.buckets[k].value += r.buckets[k].value;
    });
  });
  return finish(acc);
}

/** Bucket rate = value / MT (blank when nothing billed). */
export const bucketRate = (b) => (b.mt > 0 ? b.value / b.mt : 0);

export function filterAveragePriceRows(rows, { search }) {
  const term = (search || "").trim().toLowerCase();
  if (!term) return rows;
  return rows.filter((r) => r.section.toLowerCase().includes(term));
}