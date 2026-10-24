// Ledger calculation engine.
// Mirrors the accounting formulas from the original PO tracking spreadsheets:
// Basic Value -> GST -> Round Off -> Total Invoice Value -> Material Advance
// -> TDS -> Net Receivable -> Balance to be Received, plus a running
// material-advance ledger and per-item quantity balances.

// Material Advance % used when a PO has none stored (missing, empty or 0).
// Some POs were saved without it, which made every Material Advance show "-".
export const DEFAULT_MAT_ADV_PERCENT = 20;

/** The Mat. Adv. % actually applied to a PO (stored value, else 20), kept within 0-100. */
export function effectiveMatAdvPercent(po) {
  const stored = Number(po?.matAdvPercent);
  const pct =
    Number.isFinite(stored) && stored !== 0 ? stored : DEFAULT_MAT_ADV_PERCENT;
  return Math.min(Math.max(pct, 0), 100);
}

/** True for the text "NA" (any case) — "no material advance" marker. */
export function isNAValue(v) {
  return String(v ?? "").trim().toUpperCase() === "NA";
}

/** True when the PO has no material advance at all (small orders): "NA". */
export function isMatAdvNA(po) {
  return po?.matAdvNA === true || isNAValue(po?.matAdvNA);
}

export function roundHalf(n) {
  return Math.round((n + Number.EPSILON) * 1) / 1;
}

export function roundUp(n) {
  return Math.ceil(n - Number.EPSILON);
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Compute the full ledger for one PO sheet.
 * @param {object} po - PO sheet document (unitRate, gstPercent, tdsPercent, matAdvPercent, openingMatAdvance)
 * @param {Array} items - item rows [{id, srNo, description, weightKg}]
 * @param {Array} invoices - invoice rows [{id, invoiceNo, invoiceDate, allocations:{itemId:qty}, paymentReceived, paymentDate, matAdvanceOverride, tdsOverride, roundOffOverride}]
 */
export function computePOLedger(po, items, invoices) {
  const unitRate = num(po.unitRate);
  const gstPercent = num(po.gstPercent);
  const tdsPercent = num(po.tdsPercent);
  // Stored % (default 20 if missing/0), limited to 0-100 so bad data can't
  // blow up the totals.
  const matAdvPercent = effectiveMatAdvPercent(po);
  const openingMatAdvance = num(po.openingMatAdvance);
  const poNA = isMatAdvNA(po);

  const sortedInvoices = [...invoices].sort((a, b) => {
    const da = a.invoiceDate ? new Date(a.invoiceDate).getTime() : Infinity;
    const db = b.invoiceDate ? new Date(b.invoiceDate).getTime() : Infinity;
    if (da !== db) return da - db;
    return num(a.invoiceNo) - num(b.invoiceNo);
  });

  let runningMatAdvBal = openingMatAdvance;

  const invoiceRows = sortedInvoices.map((inv) => {
    const allocations = inv.allocations || {};
    const qty = Object.values(allocations).reduce((s, v) => s + num(v), 0);
    // Some invoices don't follow the PO's default unit rate — allow a
    // per-invoice override, falling back to the sheet's unitRate.
    const effectiveUnitRate =
      inv.unitRateOverride !== undefined && inv.unitRateOverride !== ""
        ? num(inv.unitRateOverride)
        : unitRate;
    const basic = qty * effectiveUnitRate;
    const gst = basic * (gstPercent / 100);
    const totalInvoiceValue = Math.round(basic + gst);
    const roundOff =
      inv.roundOffOverride !== undefined && inv.roundOffOverride !== ""
        ? num(inv.roundOffOverride)
        : totalInvoiceValue - basic - gst;

    // Material Advance (recovery against this bill):
    //   NA (PO-level or on this invoice) -> no material advance, 0.
    //   manual value entered             -> used exactly as entered. It may be
    //                                       above the standard % (e.g. the last
    //                                       bill when no supplies are pending).
    //   blank (auto)                     -> the standard % of Basic (20%), but
    //                                       never more than the advance still
    //                                       to be recovered (Total Mat. Adv.
    //                                       received - recovered up to the last
    //                                       bill), so a smaller advance is
    //                                       recovered only up to its balance.
    // The field name `matAdvanceOverride` is kept so stored data keeps working.
    const matAdvanceCap = Math.round(basic * (matAdvPercent / 100));
    const invNA = isNAValue(inv.matAdvanceOverride);
    const matAdvanceNA = poNA || invNA;
    const hasManualMatAdv =
      !invNA &&
      inv.matAdvanceOverride !== undefined &&
      inv.matAdvanceOverride !== "" &&
      inv.matAdvanceOverride !== null;
    let matAdvance;
    if (matAdvanceNA) {
      matAdvance = 0;
    } else if (hasManualMatAdv) {
      matAdvance = num(inv.matAdvanceOverride);
    } else if (openingMatAdvance > 0) {
      matAdvance = Math.min(matAdvanceCap, Math.max(runningMatAdvBal, 0));
    } else {
      matAdvance = matAdvanceCap;
    }

    const tds =
      inv.tdsOverride !== undefined && inv.tdsOverride !== ""
        ? num(inv.tdsOverride)
        : roundUp(basic * (tdsPercent / 100));

    const netReceivable = totalInvoiceValue - matAdvance - tds;
    const paymentReceived = num(inv.paymentReceived);
    const balanceToReceive = netReceivable - paymentReceived;

    runningMatAdvBal = runningMatAdvBal - matAdvance;

    const days =
      inv.paymentDate && inv.invoiceDate
        ? Math.round(
            (new Date(inv.paymentDate).getTime() -
              new Date(inv.invoiceDate).getTime()) /
              86400000
          ) + 1
        : null;

    return {
      ...inv,
      qty,
      unitRate: effectiveUnitRate,
      basic,
      gst,
      roundOff,
      totalInvoiceValue,
      matAdvance,
      matAdvanceCap,
      matAdvanceNA,
      tds,
      netReceivable,
      paymentReceived,
      balanceToReceive,
      // Counts toward "Bal to be received" when the bill isn't settled:
      //   balance > Rs 1  -> still due (unpaid / part-paid)  -> positive
      //   balance < -Rs 1 -> advance / excess payment        -> negative
      // Bills settled to within Rs 1 are ignored.
      isUnpaid: Math.abs(balanceToReceive) > 1,
      matAdvanceBalance: runningMatAdvBal,
      days,
    };
  });

  const itemRows = items.map((item) => {
    const allocated = invoiceRows.reduce(
      (s, inv) => s + num((inv.allocations || {})[item.id]),
      0
    );
    return {
      ...item,
      allocated,
      balanceQty: num(item.weightKg) - allocated,
    };
  });

  const totalWeightKg = items.reduce((s, i) => s + num(i.weightKg), 0);
  const totalAllocated = invoiceRows.reduce((s, r) => s + r.qty, 0);

  const totals = {
    weightKg: totalWeightKg,
    qty: totalAllocated,
    balanceQty: totalWeightKg - totalAllocated,
    basic: invoiceRows.reduce((s, r) => s + r.basic, 0),
    gst: invoiceRows.reduce((s, r) => s + r.gst, 0),
    roundOff: invoiceRows.reduce((s, r) => s + r.roundOff, 0),
    totalInvoiceValue: invoiceRows.reduce((s, r) => s + r.totalInvoiceValue, 0),
    matAdvance: invoiceRows.reduce((s, r) => s + r.matAdvance, 0),
    tds: invoiceRows.reduce((s, r) => s + r.tds, 0),
    netReceivable: invoiceRows.reduce((s, r) => s + r.netReceivable, 0),
    paymentReceived: invoiceRows.reduce((s, r) => s + r.paymentReceived, 0),
    // Outstanding total = amounts still due (+) less advances/excess
    // payments (-), ignoring bills that are settled.
    balanceToReceive: invoiceRows.reduce(
      (s, r) => s + (r.isUnpaid ? r.balanceToReceive : 0),
      0
    ),
  };

  return {
    itemRows,
    invoiceRows,
    totals,
    matAdvanceBalance: runningMatAdvBal,
    openingMatAdvance,
    matAdvNA: poNA,
  };
}

/** Whole days from invoice date to payment date; null when either is missing/invalid. */
function daysBetween(from, to) {
  if (!from || !to) return null;
  const a = typeof from.toDate === "function" ? from.toDate() : new Date(from);
  const b = typeof to.toDate === "function" ? to.toDate() : new Date(to);
  const diff = Math.round((b.getTime() - a.getTime()) / 86400000);
  return Number.isFinite(diff) ? diff : null;
}

/**
 * Build the Abstract of Structural Bills (ABS) report: one row per invoice
 * across every PO sheet, grouped by PO with subtotals and a grand total.
 */
export function computeABSReport(poSheets) {
  const groups = poSheets.map(({ po, items, invoices }) => {
    const ledger = computePOLedger(po, items, invoices);
    const rows = ledger.invoiceRows.map((inv) => ({
      poId: po.id,
      poCode: po.code,
      poNumber: po.poNumber,
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
      // ABS report: plain day count from invoice date to payment date.
      days: daysBetween(inv.invoiceDate, inv.paymentDate),
    }));

    const subtotal = rows.reduce(
      (acc, r) => {
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
      },
      {
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
      }
    );

    // Progress status used to order the report:
    //   0 = completed   (invoices raised for the full PO qty and all settled)
    //   1 = in progress (some invoicing / payment activity, not complete)
    //   2 = unattempted (no invoices raised yet)
    let status = 1;
    if (ledger.invoiceRows.length === 0) {
      status = 2;
    } else if (
      Math.abs(ledger.totals.balanceQty) < 0.001 &&
      ledger.invoiceRows.every((r) => !r.isUnpaid)
    ) {
      status = 0;
    }

    return { po, rows, subtotal, status };
  });

  // Completed first, then in-progress, then unattempted (stable within each).
  groups.sort((a, b) => a.status - b.status);

  const grandTotal = groups.reduce(
    (acc, g) => {
      acc.qty += g.subtotal.qty;
      acc.basic += g.subtotal.basic;
      acc.gst += g.subtotal.gst;
      acc.tds += g.subtotal.tds;
      acc.roundOff += g.subtotal.roundOff;
      acc.grossValue += g.subtotal.grossValue;
      acc.matAdvance += g.subtotal.matAdvance;
      acc.netReceivable += g.subtotal.netReceivable;
      acc.paymentReceived += g.subtotal.paymentReceived;
      acc.balanceToReceive += g.subtotal.balanceToReceive;
      return acc;
    },
    {
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
    }
  );

  return { groups, grandTotal };
}