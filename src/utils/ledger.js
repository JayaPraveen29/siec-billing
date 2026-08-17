// Ledger calculation engine.
// Mirrors the accounting formulas from the original PO tracking spreadsheets:
// Basic Value -> GST -> Round Off -> Total Invoice Value -> Material Advance
// -> TDS -> Net Receivable -> Balance to be Received, plus a running
// material-advance ledger and per-item quantity balances.

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
  const matAdvPercent = num(po.matAdvPercent);
  const openingMatAdvance = num(po.openingMatAdvance);

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

    const matAdvance =
      inv.matAdvanceOverride !== undefined && inv.matAdvanceOverride !== ""
        ? num(inv.matAdvanceOverride)
        : Math.round(basic * (matAdvPercent / 100));

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
      tds,
      netReceivable,
      paymentReceived,
      balanceToReceive,
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
    // "Balance to Receive" is a running/cumulative figure (like the material
    // advance balance), not a per-invoice additive line item. Summing every
    // invoice's balanceToReceive double-counts settled invoices and advance
    // -only entries. The true outstanding amount is simply the balance left
    // on the most recent invoice.
    balanceToReceive: invoiceRows.length
      ? invoiceRows[invoiceRows.length - 1].balanceToReceive
      : 0,
  };

  return {
    itemRows,
    invoiceRows,
    totals,
    matAdvanceBalance: runningMatAdvBal,
    openingMatAdvance,
  };
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
      days: inv.days,
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

    return { po, rows, subtotal };
  });

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