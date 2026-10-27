// Average Price Report engine.
// One row per Section (item description, matched case/space-insensitively)
// across every PO passed in:
//   Weight / Rate / Basic  -> what was ORDERED (sum of weights, weighted-average
//                             PO rate in Rs/MT, and weight x rate)
//   SIEC / ST              -> what was BILLED under each company group:
//                             MT billed, invoice value (basic, i.e. qty x the
//                             invoice's unit rate, before GST) and Rate/MT
//   Totals                 -> Total MT, Total Inv. Value, Avg Rate (= value / MT)

import { computePOLedger } from "./ledger";
import { PO_GROUPS } from "./groups";

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normName(s) {
  return String(s || "").trim().replace(/\s+/g, " ").toLowerCase();
}

const emptyBucket = () => ({ mt: 0, value: 0 });

/** @param {Array} poSheets - [{ po, items, invoices }] */
export function computeAveragePriceReport(poSheets) {
  const map = new Map();

  poSheets.forEach(({ po, items, invoices }) => {
    const ledger = computePOLedger(po, items || [], invoices || []);
    const unitRate = num(po.unitRate);
    const bucketKey = PO_GROUPS.includes(po.group) ? po.group : "other";

    ledger.itemRows.forEach((item) => {
      const key = normName(item.description);
      if (!key) return;
      if (!map.has(key)) {
        const buckets = { other: emptyBucket() };
        PO_GROUPS.forEach((g) => (buckets[g] = emptyBucket()));
        map.set(key, {
          section: String(item.description).trim(),
          weightMT: 0,
          basic: 0,
          buckets,
        });
      }
      const row = map.get(key);
      const ordered = num(item.weightKg);
      row.weightMT += ordered / 1000;
      row.basic += ordered * unitRate; // ordered kg x PO rate (Rs/kg)

      ledger.invoiceRows.forEach((inv) => {
        const q = num((inv.allocations || {})[item.id]); // kg billed
        if (!q) return;
        row.buckets[bucketKey].mt += q / 1000;
        row.buckets[bucketKey].value += q * inv.unitRate; // honours per-invoice rate
      });
    });
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
