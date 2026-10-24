// PO Item Wise Report engine.
// Takes the same { po, items, invoices } aggregate used by the other reports
// (see fetchAllPOData) and builds, for every PO, an item matrix:
// one row per item, one column per invoice (qty of that item billed in that
// invoice), plus ordered / billed / balance / value / status per item.

import { computePOLedger } from "./ledger";

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

const QTY_EPSILON = 0.01; // kg tolerance for "fully billed"

export const ITEM_STATUS_LABELS = {
  "fully-billed": "Fully Billed",
  "in-progress": "In Progress",
  "not-started": "Not Started",
  "over-billed": "Over Billed",
};

function itemStatus(ordered, billed) {
  const balance = ordered - billed;
  if (balance < -QTY_EPSILON) return "over-billed";
  if (billed <= QTY_EPSILON) return "not-started";
  if (balance <= QTY_EPSILON) return "fully-billed";
  return "in-progress";
}

function normName(s) {
  return String(s || "").trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Build one group (item matrix) per PO.
 * @param {Array} poSheets - [{ po, items, invoices }]
 */
export function computePOItemWiseReport(poSheets) {
  const groups = poSheets.map(({ po, items, invoices }) => {
    const ledger = computePOLedger(po, items, invoices);

    const invoiceCols = ledger.invoiceRows.map((inv) => ({
      id: inv.id,
      invoiceNo: inv.invoiceNo,
      invoiceDate: inv.invoiceDate,
      unitRate: inv.unitRate,
    }));

    const rows = ledger.itemRows.map((item) => {
      const perInvoice = {};
      let value = 0;
      ledger.invoiceRows.forEach((inv) => {
        const q = num((inv.allocations || {})[item.id]);
        if (q) {
          perInvoice[inv.id] = q;
          value += q * inv.unitRate; // honours per-invoice unit-rate overrides
        }
      });
      const ordered = num(item.weightKg);
      const billed = item.allocated;
      return {
        itemId: item.id,
        srNo: item.srNo,
        description: item.description || "",
        nameKey: normName(item.description),
        ordered,
        perInvoice,
        billed,
        balance: ordered - billed,
        pctBilled: ordered > 0 ? (billed / ordered) * 100 : 0,
        value,
        status: itemStatus(ordered, billed),
      };
    });

    return {
      poId: po.id,
      poCode: po.code,
      poNumber: po.poNumber,
      group: po.group,
      unitRate: num(po.unitRate),
      invoiceCols,
      rows,
      // 0 = fully billed (every item), 2 = not started (nothing billed),
      // 1 = partially billed.
      billingRank:
        rows.length > 0 &&
        rows.every((r) => r.status === "fully-billed" || r.status === "over-billed")
          ? 0
          : rows.every((r) => r.status === "not-started")
          ? 2
          : 1,
    };
  });

  // Fully billed POs first, then partially billed, then not started.
  groups.sort((a, b) => a.billingRank - b.billingRank);
  return groups;
}

/** Sum a list of item rows into a subtotal row. */
export function sumItemRows(rows) {
  const sub = { ordered: 0, billed: 0, balance: 0, value: 0, perInvoice: {} };
  rows.forEach((r) => {
    sub.ordered += r.ordered;
    sub.billed += r.billed;
    sub.balance += r.balance;
    sub.value += r.value;
    Object.entries(r.perInvoice).forEach(([id, q]) => {
      sub.perInvoice[id] = (sub.perInvoice[id] || 0) + q;
    });
  });
  sub.pctBilled = sub.ordered > 0 ? (sub.billed / sub.ordered) * 100 : 0;
  return sub;
}

/**
 * Distinct item names (for the Item dropdown) across the given groups.
 */
export function listItemNames(groups) {
  const map = new Map();
  groups.forEach((g) =>
    g.rows.forEach((r) => {
      if (r.nameKey && !map.has(r.nameKey)) map.set(r.nameKey, r.description.trim());
    })
  );
  return [...map.entries()]
    .map(([key, label]) => ({ key, label }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
}

/**
 * Apply the page filters. Returns { groups, grandTotal } where each group has
 * only its matching items, only the invoice columns that still carry a qty,
 * and a recalculated subtotal.
 */
export function filterPOItemWiseGroups(
  groups,
  { poId = "all", itemKey = "all", status = "all", search = "", pendingOnly = false }
) {
  const term = search.trim().toLowerCase();

  const out = groups
    .filter((g) => poId === "all" || g.poId === poId)
    .map((g) => {
      const rows = g.rows.filter((r) => {
        if (itemKey !== "all" && r.nameKey !== itemKey) return false;
        if (status !== "all" && r.status !== status) return false;
        if (pendingOnly && r.balance <= QTY_EPSILON) return false;
        if (term && !`${r.srNo} ${r.description}`.toLowerCase().includes(term)) return false;
        return true;
      });
      const subtotal = sumItemRows(rows);
      // Hide invoice columns nothing visible was billed in.
      const invoiceCols = g.invoiceCols.filter((c) => subtotal.perInvoice[c.id]);
      return { ...g, rows, invoiceCols, subtotal };
    })
    .filter((g) => g.rows.length > 0);

  const grandTotal = sumItemRows(out.flatMap((g) => g.rows));
  return { groups: out, grandTotal };
}
