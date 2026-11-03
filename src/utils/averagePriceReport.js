// Average Price Report engine.
// Table: SIEC | ST | Total, each split into STRL | CT | SCRAP, each with
// MT / Rate / Value (see `cells`).
// One row per PO (all of the PO's items rolled together; `section` holds the
// PO number). Everything is based on what was ORDERED - no invoice values:
//   Weight / Rate / Basic  -> sum of item weights, PO rate in Rs/MT, and
//                             weight x rate (Basic = before GST)
//   SIEC / ST              -> the same MT / Basic / Rate/MT, placed under the
//                             company group the PO belongs to
//   Totals                 -> Total MT, Total Basic, Avg Rate (= Basic / MT)

import { PO_GROUPS, WORK_TYPES } from "./groups";
import { inFinancialYear } from "./financialYear";
import { CT_TUB_WEIGHT_KG, ctItemNumbers } from "./ledger";

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

const emptyBucket = () => ({ mt: 0, value: 0 });

// Top-level blocks of the table: each company, then the overall Total.
export const SECTIONS = [...PO_GROUPS, "Total"];

// cells[section][workType] = { mt, value }
const emptyCells = () =>
  Object.fromEntries(
    SECTIONS.map((s) => [s, Object.fromEntries(WORK_TYPES.map((w) => [w, emptyBucket()]))])
  );

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
    const isCT = po.workType === "CT";
    // Coal Tub POs are priced per tub (Nos.), not per kg:
    //   KG price = unit rate / 586      qty kg = PO qty (Nos.) x 586
    const unitRate = isCT ? num(po.unitRate) / CT_TUB_WEIGHT_KG : num(po.unitRate);

    // One row per PO: every item of the PO is rolled into that PO's row.
    const cells = emptyCells();
    const row = {
      poId: po.id,
      groupRank: PO_GROUPS.includes(po.group) ? PO_GROUPS.indexOf(po.group) : PO_GROUPS.length,
      section: String(po.poNumber || po.code || po.id).trim(),
      weightMT: 0,
      basic: 0,
      cells,
    };

    (items || []).forEach((item) => {
      const ordered = isCT ? ctItemNumbers(item) * CT_TUB_WEIGHT_KG : num(item.weightKg);
      row.weightMT += ordered / 1000;
      row.basic += ordered * unitRate; // ordered kg x rate per kg (CT: unit rate / 586)
    });

    // Ordered MT / Basic go under the PO's company (SIEC / ST) and work type
    // (STRL / CT / SCRAP), and always into the overall Total block.
    if (WORK_TYPES.includes(po.workType)) {
      const targets = ["Total"];
      if (PO_GROUPS.includes(po.group)) targets.push(po.group);
      targets.forEach((t) => {
        row.cells[t][po.workType].mt += row.weightMT;
        row.cells[t][po.workType].value += row.basic;
      });
    }

    map.set(po.id, row);
  });

  const rows = [...map.values()]
    .map((r) => finish(r))
    // SIEC POs first, then ST, then any PO without a group; PO number order
    // inside each group.
    .sort(
      (a, b) =>
        a.groupRank - b.groupRank ||
        a.section.localeCompare(b.section, undefined, { numeric: true, sensitivity: "base" })
    );

  return { rows, grandTotal: sumAveragePriceRows(rows) };
}

function finish(r) {
  return {
    poId: r.poId,
    groupRank: r.groupRank,
    section: r.section,
    weightMT: r.weightMT,
    basic: r.basic,
    rate: r.weightMT > 0 ? r.basic / r.weightMT : 0, // Rs / MT
    cells: r.cells,
  };
}

/** Sum a list of rows (used for the Grand Total of whatever is visible). */
export function sumAveragePriceRows(rows) {
  const acc = { section: "Grand Total", weightMT: 0, basic: 0, cells: emptyCells() };
  rows.forEach((r) => {
    acc.weightMT += r.weightMT;
    acc.basic += r.basic;
    SECTIONS.forEach((s) =>
      WORK_TYPES.forEach((w) => {
        acc.cells[s][w].mt += r.cells[s][w].mt;
        acc.cells[s][w].value += r.cells[s][w].value;
      })
    );
  });
  return finish(acc);
}

/** Rate = value / MT (Rs/MT). */
export const bucketRate = (b) => (b.mt > 0 ? b.value / b.mt : 0);

export function filterAveragePriceRows(rows, { search }) {
  const term = (search || "").trim().toLowerCase();
  if (!term) return rows;
  return rows.filter((r) => r.section.toLowerCase().includes(term));
}