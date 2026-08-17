import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Plus, Pencil, Trash2, ChevronDown, ClipboardPaste, Settings } from "lucide-react";
import {
  addInvoice,
  addItem,
  addItemsBulk,
  deleteInvoice,
  deleteItem,
  subscribeInvoices,
  subscribeItems,
  subscribePOSheets,
  updateInvoice,
  updateItem,
  updatePOSheet,
} from "../../services/poService";
import { computePOLedger } from "../../utils/ledger";
import { fmtINR, fmtNum, fmtDate, toInputDate } from "../../utils/format";
import TitleBlock from "../../components/TitleBlock";
import Loading from "../../components/Loading";
import ConfirmDialog from "../../components/ConfirmDialog";
import StatCard from "../../components/StatCard";
import { usePOImport } from "../../hooks/usePOImport";
import ImportPOModal from "./ImportPOModal";
import "./POSheet.css";

const emptyItem = { srNo: "", description: "", weightKg: "" };

// --- DD-MM-YY <-> ISO (yyyy-mm-dd) helpers for manual date entry ---
function ddmmyyToIso(str) {
  const m = /^(\d{2})-(\d{2})-(\d{2})$/.exec((str || "").trim());
  if (!m) return null;
  const [, dd, mm, yy] = m;
  const day = Number(dd);
  const month = Number(mm);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const year = 2000 + Number(yy);
  return `${year}-${mm}-${dd}`;
}

function isoToDdmmyy(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}-${mm}-${yy}`;
}

export default function POSheet() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [po, setPo] = useState(null);
  const [items, setItems] = useState(null);
  const [invoices, setInvoices] = useState(null);

  const [itemModal, setItemModal] = useState(null); // {mode:'new'|'edit', data}
  const [bulkModal, setBulkModal] = useState(false);
  const [invoiceModal, setInvoiceModal] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null); // {type, id}
  const [settingsModal, setSettingsModal] = useState(false);

  // Draft values for the inline-editable Unit Rate cells (one per invoice
  // column) — some invoices don't follow the PO's default unit rate.
  const [unitRateDrafts, setUnitRateDrafts] = useState({});
  // Which invoice's Unit Rate cell is currently in edit mode. Double-click
  // a value to edit it; it reverts to plain text on save/cancel.
  const [editingUnitRateId, setEditingUnitRateId] = useState(null);

  function startEditingUnitRate(inv) {
    setUnitRateDrafts((prev) => ({
      ...prev,
      [inv.id]: inv.unitRateOverride ?? "",
    }));
    setEditingUnitRateId(inv.id);
  }

  function cancelEditingUnitRate(invoiceId) {
    setUnitRateDrafts((prev) => {
      const next = { ...prev };
      delete next[invoiceId];
      return next;
    });
    setEditingUnitRateId(null);
  }

  async function handleUnitRateOverrideChange(invoiceId, rawValue) {
    const value = rawValue.trim();
    await updateInvoice(id, invoiceId, {
      unitRateOverride: value === "" ? "" : Number(value),
    });
    setUnitRateDrafts((prev) => {
      const next = { ...prev };
      delete next[invoiceId];
      return next;
    });
    setEditingUnitRateId(null);
  }

  // Excel import: all orchestration logic lives in usePOImport (hooks/usePOImport.js),
  // this page only needs the modal-open state + the handler it exposes.
  const { importModalOpen, openImportModal, closeImportModal, handleImportPOSheet } =
    usePOImport(id, items);

  useEffect(() => {
    const unsub = subscribePOSheets((all) => {
      const found = all.find((p) => p.id === id);
      setPo(found || null);
    });
    return unsub;
  }, [id]);

  useEffect(() => subscribeItems(id, setItems), [id]);
  useEffect(() => subscribeInvoices(id, setInvoices), [id]);

  const ledger = useMemo(() => {
    if (!po || !items || !invoices) return null;
    return computePOLedger(po, items, invoices);
  }, [po, items, invoices]);

  // Raw invoices (each carries an `allocations` map of itemId -> qty billed),
  // sorted chronologically so matrix columns read left-to-right by date.
  const sortedInvoicesForMatrix = useMemo(() => {
    if (!invoices) return [];
    return [...invoices].sort((a, b) => {
      const da = a.invoiceDate ? new Date(a.invoiceDate).getTime() : Infinity;
      const db = b.invoiceDate ? new Date(b.invoiceDate).getTime() : Infinity;
      if (da !== db) return da - db;
      return (a.invoiceNo || "").localeCompare(b.invoiceNo || "");
    });
  }, [invoices]);

  // Lookup from invoice id -> its computed ledger row (basic, gst, netReceivable, etc.)
  // so the summary rows below the item matrix can pull per-invoice figures.
  const invoiceRowById = useMemo(() => {
    const map = {};
    (ledger?.invoiceRows || []).forEach((r) => {
      map[r.id] = r;
    });
    return map;
  }, [ledger]);

  // The 11 Excel-style summary rows shown below the item matrix, one column per invoice.
  const SUMMARY_ROW_DEFS = useMemo(() => {
    if (!po) return [];
    return [
      { no: 1, label: "Unit Rate", getVal: (r) => (r ? r.unitRate : null) },
      { no: 2, label: "Basic Value", getVal: (r) => r?.basic },
      { no: 3, label: `GST @ ${po.gstPercent}%`, getVal: (r) => r?.gst },
      { no: 4, label: "Round Off", getVal: (r) => r?.roundOff },
      { no: 5, label: "Total Invoice Value", getVal: (r) => r?.totalInvoiceValue, bold: true },
      { no: 6, label: `Material Advance @ ${po.matAdvPercent}%`, getVal: (r) => r?.matAdvance },
      { no: 7, label: `TDS @ ${po.tdsPercent}%`, getVal: (r) => r?.tds },
      {
        no: 8,
        label: "Net Receivable",
        getVal: (r) => r?.netReceivable,
        bold: true,
        accentClass: "text-rivet2",
      },
      // Running-balance rows: these track a cumulative balance carried
      // forward invoice-to-invoice (like a bank balance), not a per-invoice
      // amount that's meaningful to add up. Their "Total" column should show
      // the latest running value, not sum every invoice's snapshot of it.
      { no: 9, label: "Bala. Mat. Advance", getVal: (r) => r?.matAdvanceBalance, totalMode: "last" },
      { no: 10, label: "Payment received", getVal: (r) => r?.paymentReceived },
      {
        no: 11,
        label: "Bal to be received",
        getVal: (r) => r?.balanceToReceive,
        accentFn: (v) => (v > 0.5 ? "text-warn" : "text-ok"),
        totalMode: "last",
      },
    ];
  }, [po]);

  if (po === null || items === null || invoices === null) {
    return (
      <div className="po-page">
        <Loading label="Loading PO sheet" />
      </div>
    );
  }

  async function handleSaveItem(data) {
    if (itemModal.mode === "new") {
      await addItem(id, data);
    } else {
      await updateItem(id, itemModal.data.id, data);
    }
    setItemModal(null);
  }

  async function handleBulkAddItems(rows) {
    await addItemsBulk(id, rows);
    setBulkModal(false);
  }

  async function handleSaveInvoice(data) {
    if (invoiceModal.mode === "new") {
      await addInvoice(id, data);
    } else {
      await updateInvoice(id, invoiceModal.data.id, data);
    }
    setInvoiceModal(null);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    if (deleteTarget.type === "item") await deleteItem(id, deleteTarget.id);
    if (deleteTarget.type === "invoice") await deleteInvoice(id, deleteTarget.id);
    setDeleteTarget(null);
  }

  async function handleSaveSettings(data) {
    await updatePOSheet(id, data);
    setSettingsModal(false);
  }

  return (
    <div className="po-page">
      <button onClick={() => navigate("/")} className="back-link">
        <ArrowLeft size={15} /> Back to register
      </button>

      <div className="po-titleblock-row">
        <TitleBlock
          docType="PO Billing Ledger"
          fields={[
            { label: "PO No.", value: po.poNumber },
            { label: "Sheet Code", value: po.code },
            { label: "Unit Rate", value: `₹${fmtNum(po.unitRate, 2)}/kg` },
            { label: "GST", value: `${po.gstPercent}%` },
          ]}
        />
        <button
          onClick={() => setSettingsModal(true)}
          className="btn-outline po-settings-btn"
          title="Edit Unit Rate, GST, TDS, Material Advance %"
        >
          <Settings size={15} /> Edit Rate & Settings
        </button>
      </div>
      {po.title && <p className="po-title-desc">{po.title}</p>}

      <div className="po-stat-grid">
        <StatCard label="Total Weight" value={`${fmtNum(ledger.totals.weightKg, 1)} kg`} />
        <StatCard
          label="Balance Weight"
          value={`${fmtNum(ledger.totals.balanceQty, 1)} kg`}
          accent={ledger.totals.balanceQty > 0 ? "warn" : "ok"}
        />
        <StatCard label="Net Receivable" value={fmtINR(ledger.totals.netReceivable)} />
        <StatCard
          label="Balance to Receive"
          value={fmtINR(ledger.totals.balanceToReceive)}
          accent={ledger.totals.balanceToReceive > 0 ? "warn" : "ok"}
        />
      </div>

      {/* ITEMS (Excel-style matrix: items down the rows, invoices across as columns) */}
      <section className="po-section">
        <div className="po-section-header">
          <h2 className="section-title">Items</h2>
          <div className="header-btn-group">
            <button onClick={openImportModal} className="btn-outline">
              <ClipboardPaste size={15} /> Import from Excel
            </button>
            <button onClick={() => setBulkModal(true)} className="btn-outline">
              <ClipboardPaste size={15} /> Bulk Add
            </button>
            <button
              onClick={() => setItemModal({ mode: "new", data: emptyItem })}
              className="btn-outline"
            >
              <Plus size={15} /> Add Item
            </button>
            <button
              onClick={() => setInvoiceModal({ mode: "new", data: null })}
              disabled={ledger.itemRows.length === 0}
              className="btn-primary"
            >
              <Plus size={15} /> Add Invoice
            </button>
          </div>
        </div>
        <div className="table-scroll">
          <table className="ledger-table po-matrix-table">
            <thead>
              <tr>
                <th rowSpan={4}>No.</th>
                <th rowSpan={4}>Description</th>
                <th rowSpan={4} className="text-right">Wt./Kg</th>
                {sortedInvoicesForMatrix.length > 0 && (
                  <th colSpan={sortedInvoicesForMatrix.length} className="text-center">
                    Invoice Numbers
                  </th>
                )}
                <th rowSpan={4} className="text-right">Bala/Total</th>
                <th rowSpan={4}></th>
              </tr>
              <tr>
                {sortedInvoicesForMatrix.map((inv) => (
                  <th key={inv.id} className="text-right">
                    {inv.invoiceNo}
                  </th>
                ))}
              </tr>
              <tr>
                {sortedInvoicesForMatrix.map((inv) => (
                  <th key={inv.id} className="text-right text-muted">
                    {fmtDate(inv.invoiceDate)}
                  </th>
                ))}
              </tr>
              <tr>
                {sortedInvoicesForMatrix.map((inv) => (
                  <th key={inv.id} className="text-right">
                    <div className="row-actions" style={{ justifyContent: "flex-end" }}>
                      <button
                        onClick={() => setInvoiceModal({ mode: "edit", data: invoiceRowById[inv.id] })}
                        className="edit-btn"
                        title="Edit invoice"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => setDeleteTarget({ type: "invoice", id: inv.id })}
                        className="delete-btn"
                        title="Delete invoice"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ledger.itemRows.map((it) => (
                <tr key={it.id}>
                  <td>{it.srNo}</td>
                  <td>{it.description}</td>
                  <td className="text-right tabular">{fmtNum(it.weightKg, 2)}</td>
                  {sortedInvoicesForMatrix.map((inv) => {
                    const qty = Number(inv.allocations?.[it.id]) || 0;
                    return (
                      <td key={inv.id} className="text-right tabular">
                        {qty > 0 ? fmtNum(qty, 2) : "-"}
                      </td>
                    );
                  })}
                  <td className={`text-right tabular ${it.balanceQty > 0.001 ? "text-warn" : "text-ok"}`}>
                    {it.balanceQty > 0.001 ? fmtNum(it.balanceQty, 2) : "-"}
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        onClick={() => setItemModal({ mode: "edit", data: it })}
                        className="edit-btn"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => setDeleteTarget({ type: "item", id: it.id })}
                        className="delete-btn"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {ledger.itemRows.length === 0 && (
                <tr>
                  <td
                    colSpan={5 + sortedInvoicesForMatrix.length}
                    className="text-center text-muted"
                    style={{ padding: "1.5rem 0" }}
                  >
                    No items yet.
                  </td>
                </tr>
              )}
            </tbody>
            {ledger.itemRows.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={2}>Total</td>
                  <td className="text-right tabular">{fmtNum(ledger.totals.weightKg, 2)}</td>
                  {sortedInvoicesForMatrix.map((inv) => {
                    const colTotal = ledger.itemRows.reduce(
                      (sum, it) => sum + (Number(inv.allocations?.[it.id]) || 0),
                      0
                    );
                    return (
                      <td key={inv.id} className="text-right tabular">
                        {colTotal > 0 ? fmtNum(colTotal, 2) : "-"}
                      </td>
                    );
                  })}
                  <td className="text-right tabular">{fmtNum(ledger.totals.balanceQty, 2)}</td>
                  <td></td>
                </tr>
              </tfoot>
            )}

            {/* Invoice financial summary rows: Unit Rate through Bal to be received,
                one column per invoice (same columns as the item matrix above). */}
            {sortedInvoicesForMatrix.length > 0 && (
              <tbody className="po-summary-rows">
                <tr className="po-summary-row-bold">
                  <td></td>
                  <td>Total Weight</td>
                  <td className="text-right tabular">{fmtNum(ledger.totals.weightKg, 2)}</td>
                  {sortedInvoicesForMatrix.map((inv) => {
                    const r = invoiceRowById[inv.id];
                    const qty = r?.qty;
                    return (
                      <td key={inv.id} className="text-right tabular" style={{ fontWeight: 600 }}>
                        {qty > 0 ? fmtNum(qty, 2) : "-"}
                      </td>
                    );
                  })}
                  <td className="text-right tabular" style={{ fontWeight: 600 }}>
                    {ledger.totals.balanceQty > 0.001 ? fmtNum(ledger.totals.balanceQty, 2) : "-"}
                  </td>
                  <td></td>
                </tr>
                {SUMMARY_ROW_DEFS.map((def) => {
                  let rowTotal = null;
                  if (def.no !== 1) {
                    if (def.totalMode === "last") {
                      const lastInv =
                        sortedInvoicesForMatrix[sortedInvoicesForMatrix.length - 1];
                      const r = lastInv ? invoiceRowById[lastInv.id] : null;
                      rowTotal = Number(def.getVal(r)) || 0;
                    } else {
                      rowTotal = sortedInvoicesForMatrix.reduce((sum, inv) => {
                        const r = invoiceRowById[inv.id];
                        return sum + (Number(def.getVal(r)) || 0);
                      }, 0);
                    }
                  }

                  return (
                    <tr key={def.no} className={def.bold ? "po-summary-row-bold" : undefined}>
                      <td>{def.no}</td>
                      <td>{def.label}</td>
                      <td
                        className="text-right tabular"
                        style={def.bold ? { fontWeight: 600 } : undefined}
                      >
                        {def.no === 1
                          ? fmtNum(po.unitRate, 2)
                          : rowTotal
                          ? fmtNum(rowTotal, 0)
                          : "-"}
                      </td>
                      {sortedInvoicesForMatrix.map((inv) => {
                        if (def.no === 1) {
                          const r = invoiceRowById[inv.id];
                          const effectiveRate = r?.unitRate ?? po.unitRate;

                          if (editingUnitRateId === inv.id) {
                            const draft = unitRateDrafts[inv.id];
                            const value = draft !== undefined ? draft : "";
                            return (
                              <td key={inv.id} className="text-right tabular">
                                <input
                                  autoFocus
                                  type="number"
                                  step="0.01"
                                  value={value}
                                  onChange={(e) =>
                                    setUnitRateDrafts((prev) => ({
                                      ...prev,
                                      [inv.id]: e.target.value,
                                    }))
                                  }
                                  onFocus={(e) => e.target.select()}
                                  onBlur={(e) =>
                                    handleUnitRateOverrideChange(inv.id, e.target.value)
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") e.target.blur();
                                    if (e.key === "Escape") cancelEditingUnitRate(inv.id);
                                  }}
                                  className="input po-unit-rate-input"
                                  title="Leave blank to use the PO's default unit rate"
                                />
                              </td>
                            );
                          }

                          return (
                            <td
                              key={inv.id}
                              className="text-right tabular po-unit-rate-display"
                              onDoubleClick={() => startEditingUnitRate(inv)}
                              title="Double-click to edit"
                            >
                              {fmtNum(effectiveRate, 2)}
                            </td>
                          );
                        }
                        const r = invoiceRowById[inv.id];
                        const raw = def.getVal(r);
                        const display =
                          raw && raw !== 0
                            ? fmtNum(raw, def.no === 1 ? 2 : 0)
                            : "-";
                        const accentClass = def.accentFn ? def.accentFn(raw || 0) : def.accentClass || "";
                        return (
                          <td
                            key={inv.id}
                            className={`text-right tabular ${accentClass}`}
                            style={def.bold ? { fontWeight: 600 } : undefined}
                          >
                            {display}
                          </td>
                        );
                      })}
                      <td className="text-right tabular" style={def.bold ? { fontWeight: 600 } : undefined}>
                        {def.no === 1 || !rowTotal ? "-" : fmtNum(rowTotal, 0)}
                      </td>
                      <td></td>
                    </tr>
                  );
                })}
              </tbody>
            )}
          </table>
        </div>
      </section>

      {settingsModal && (
        <PoSettingsModal
          po={po}
          onCancel={() => setSettingsModal(false)}
          onSave={handleSaveSettings}
        />
      )}

      {importModalOpen && (
        <ImportPOModal onCancel={closeImportModal} onImport={handleImportPOSheet} />
      )}

      {bulkModal && (
        <BulkAddItemsModal
          existingCount={items.length}
          onCancel={() => setBulkModal(false)}
          onSave={handleBulkAddItems}
        />
      )}

      {itemModal && (
        <ItemModal
          mode={itemModal.mode}
          data={itemModal.data}
          onCancel={() => setItemModal(null)}
          onSave={handleSaveItem}
        />
      )}

      {invoiceModal && (
        <InvoiceModal
          mode={invoiceModal.mode}
          data={invoiceModal.data}
          items={ledger.itemRows}
          onCancel={() => setInvoiceModal(null)}
          onSave={handleSaveInvoice}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title={`Delete ${deleteTarget?.type}?`}
        message="This cannot be undone. Totals will recalculate automatically."
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}

// Edit the PO header settings — Unit Rate, GST %, TDS %, Material Advance %,
// Opening Material Advance — the same values that live in cells C17, and the
// "GST @ x%" / "TDS @ x%" / "Material Advance @ x%" row labels + M2 in the
// source spreadsheet. These drive every downstream formula in ledger.js.
function PoSettingsModal({ po, onCancel, onSave }) {
  const [form, setForm] = useState({
    unitRate: po.unitRate ?? "",
    gstPercent: po.gstPercent ?? "",
    tdsPercent: po.tdsPercent ?? "",
    matAdvPercent: po.matAdvPercent ?? "",
    openingMatAdvance: po.openingMatAdvance ?? "",
  });
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        unitRate: Number(form.unitRate) || 0,
        gstPercent: Number(form.gstPercent) || 0,
        tdsPercent: Number(form.tdsPercent) || 0,
        matAdvPercent: Number(form.matAdvPercent) || 0,
        openingMatAdvance: Number(form.openingMatAdvance) || 0,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay">
      <form onSubmit={submit} className="modal-panel">
        <h3 className="modal-title">Edit Rate & Settings</h3>

        <label style={{ display: "block" }}>
          <span className="field-label">Unit Rate (₹/kg)</span>
          <input
            type="number"
            step="0.01"
            required
            value={form.unitRate}
            onChange={(e) => setForm({ ...form, unitRate: e.target.value })}
            className="input"
            style={{ marginTop: "0.25rem" }}
          />
        </label>

        <div className="form-row-3" style={{ marginTop: "0.75rem" }}>
          <label style={{ display: "block" }}>
            <span className="field-label">GST %</span>
            <input
              type="number"
              step="0.01"
              value={form.gstPercent}
              onChange={(e) => setForm({ ...form, gstPercent: e.target.value })}
              className="input"
              style={{ marginTop: "0.25rem" }}
            />
          </label>
          <label style={{ display: "block" }}>
            <span className="field-label">TDS %</span>
            <input
              type="number"
              step="0.01"
              value={form.tdsPercent}
              onChange={(e) => setForm({ ...form, tdsPercent: e.target.value })}
              className="input"
              style={{ marginTop: "0.25rem" }}
            />
          </label>
          <label style={{ display: "block" }}>
            <span className="field-label">Mat. Adv. %</span>
            <input
              type="number"
              step="0.01"
              value={form.matAdvPercent}
              onChange={(e) => setForm({ ...form, matAdvPercent: e.target.value })}
              className="input"
              style={{ marginTop: "0.25rem" }}
            />
          </label>
        </div>

        <label style={{ display: "block", marginTop: "0.75rem" }}>
          <span className="field-label">Opening Mat. Advance (₹)</span>
          <input
            type="number"
            value={form.openingMatAdvance}
            onChange={(e) => setForm({ ...form, openingMatAdvance: e.target.value })}
            className="input"
            style={{ marginTop: "0.25rem" }}
          />
        </label>

        <div className="modal-actions">
          <button type="button" onClick={onCancel} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ItemModal({ mode, data, onCancel, onSave }) {
  const [form, setForm] = useState({
    srNo: data.srNo ?? "",
    description: data.description ?? "",
    weightKg: data.weightKg ?? "",
  });

  return (
    <div className="modal-overlay">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave({
            srNo: Number(form.srNo) || 0,
            description: form.description.trim(),
            weightKg: Number(form.weightKg) || 0,
          });
        }}
        className="modal-panel"
        style={{ maxWidth: "28rem" }}
      >
        <h3 className="modal-title">{mode === "new" ? "Item" : "Edit Item"}</h3>
        <label style={{ display: "block" }}>
          <span className="field-label">No.</span>
          <input
            required
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={form.srNo}
            onChange={(e) => setForm({ ...form, srNo: e.target.value })}
            className="input"
            style={{ marginTop: "0.25rem" }}
          />
        </label>
        <label style={{ display: "block" }}>
          <span className="field-label">Description</span>
          <input
            required
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="input"
            style={{ marginTop: "0.25rem" }}
          />
        </label>
        <label style={{ display: "block" }}>
          <span className="field-label">Weight (kg)</span>
          <input
            required
            type="number"
            step="0.01"
            value={form.weightKg}
            onChange={(e) => setForm({ ...form, weightKg: e.target.value })}
            className="input"
            style={{ marginTop: "0.25rem" }}
          />
        </label>
        <div className="modal-actions">
          <button type="button" onClick={onCancel} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" className="btn-primary">
            Save
          </button>
        </div>
      </form>
    </div>
  );
}

export function parseBulkItemsText(text, startingSrNo) {
  const lines = text
    .split("\n")
    .map((l) => l.replace(/\r/g, "").trim())
    .filter((l) => l.length > 0);

  const rows = lines
    .map((line) => {
      // Excel/Sheets paste uses tabs between columns; fall back to 2+ spaces or a comma.
      let cols = line.split("\t");
      if (cols.length < 2) cols = line.split(/ {2,}/);
      if (cols.length < 2) cols = line.split(",");
      return cols.map((c) => c.trim()).filter((c, i, arr) => !(arr.length === 1 && c === ""));
    })
    .filter((cols) => cols.length >= 2);

  // Drop an obvious header row, e.g. "No. Description Wt./Kg"
  const looksLikeHeader = (cols) =>
    cols.some((c) => /^(no\.?|sr\.?\s*no\.?)$/i.test(c)) ||
    cols.some((c) => /description/i.test(c));
  const dataRows = rows.length && looksLikeHeader(rows[0]) ? rows.slice(1) : rows;

  return dataRows.map((cols, idx) => {
    // 3 columns => No, Description, Weight. 2 columns => Description, Weight (auto-number).
    let srNo, description, weightRaw;
    if (cols.length >= 3) {
      [srNo, description, weightRaw] = cols;
    } else {
      description = cols[0];
      weightRaw = cols[1];
      srNo = String(startingSrNo + idx);
    }
    const weightKg = Number(String(weightRaw).replace(/[^0-9.-]/g, ""));
    const valid = description.length > 0 && Number.isFinite(weightKg) && weightKg > 0;
    return {
      srNo: srNo || String(startingSrNo + idx),
      description,
      weightKg,
      valid,
    };
  });
}

function BulkAddItemsModal({ existingCount, onCancel, onSave }) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  const parsed = useMemo(
    () => parseBulkItemsText(text, existingCount + 1),
    [text, existingCount]
  );
  const validRows = parsed.filter((r) => r.valid);
  const invalidCount = parsed.length - validRows.length;

  async function submit(e) {
    e.preventDefault();
    if (validRows.length === 0) return;
    setSaving(true);
    try {
      await onSave(
        validRows.map(({ srNo, description, weightKg }) => ({
          srNo: Number(srNo) || 0,
          description,
          weightKg,
        }))
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay">
      <form onSubmit={submit} className="modal-panel bulk-modal">
        <h3 className="modal-title">Bulk Add Items</h3>
      
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          className="input bulk-textarea"
        />

        {parsed.length > 0 && (
          <div>
            <div className="bulk-summary">
              <span className="bulk-summary-ok">{validRows.length} row{validRows.length === 1 ? "" : "s"} ready</span>
              {invalidCount > 0 && (
                <span className="bulk-summary-bad">
                  {invalidCount} row{invalidCount === 1 ? "" : "s"} skipped (missing description or weight)
                </span>
              )}
            </div>
            <div className="item-list bulk-preview">
              {parsed.map((r, i) => (
                <div key={i} className={`item-list-row${r.valid ? "" : " bulk-row-invalid"}`}>
                  <div className="item-list-desc">
                    <span className="item-list-sr">{r.srNo}</span>
                    {r.description || <em className="text-muted">(no description)</em>}
                  </div>
                  <span className="bulk-preview-weight tabular">
                    {Number.isFinite(r.weightKg) ? `${fmtNum(r.weightKg, 2)} kg` : "—"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="modal-actions">
          <button type="button" onClick={onCancel} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={validRows.length === 0 || saving} className="btn-primary">
            {saving ? "Adding…" : `Add ${validRows.length || ""} Item${validRows.length === 1 ? "" : "s"}`}
          </button>
        </div>
      </form>
    </div>
  );
}

function InvoiceModal({ mode, data, items, onCancel, onSave }) {
  const [invoiceNo, setInvoiceNo] = useState(data?.invoiceNo ?? "");
  const [invoiceDateText, setInvoiceDateText] = useState(
    isoToDdmmyy(toInputDate(data?.invoiceDate)) || ""
  );
  const [invoiceDateError, setInvoiceDateError] = useState("");
  const [allocations, setAllocations] = useState(() => {
    const base = {};
    items.forEach((it) => {
      base[it.id] = data?.allocations?.[it.id] ?? "";
    });
    return base;
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [matAdvanceOverride, setMatAdvanceOverride] = useState(
    data?.matAdvanceOverride ?? ""
  );
  const [tdsOverride, setTdsOverride] = useState(data?.tdsOverride ?? "");
  const [roundOffOverride, setRoundOffOverride] = useState(
    data?.roundOffOverride ?? ""
  );

  function handleDateChange(raw) {
    // Auto-insert dashes as the user types digits: 280326 -> 28-03-26
    let digits = raw.replace(/[^0-9]/g, "").slice(0, 6);
    let formatted = digits;
    if (digits.length > 4) {
      formatted = `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`;
    } else if (digits.length > 2) {
      formatted = `${digits.slice(0, 2)}-${digits.slice(2)}`;
    }
    setInvoiceDateText(formatted);
    setInvoiceDateError("");
  }

  function submit(e) {
    e.preventDefault();

    const isoInvoiceDate = ddmmyyToIso(invoiceDateText);
    if (!isoInvoiceDate) {
      setInvoiceDateError("Enter date as DD-MM-YY, e.g. DD-MM-YY");
      return;
    }

    const cleanAllocations = {};
    Object.entries(allocations).forEach(([k, v]) => {
      if (v !== "" && Number(v) !== 0) cleanAllocations[k] = Number(v);
    });
    onSave({
      invoiceNo: invoiceNo.trim(),
      invoiceDate: isoInvoiceDate,
      allocations: cleanAllocations,
      matAdvanceOverride: matAdvanceOverride === "" ? "" : Number(matAdvanceOverride),
      tdsOverride: tdsOverride === "" ? "" : Number(tdsOverride),
      roundOffOverride: roundOffOverride === "" ? "" : Number(roundOffOverride),
    });
  }

  return (
    <div className="modal-overlay">
      <form onSubmit={submit} className="modal-panel invoice-modal">
        <h3 className="modal-title">{mode === "new" ? "Add Invoice" : "Edit Invoice"}</h3>

        <div className="form-row-2">
          <label style={{ display: "block" }}>
            <span className="field-label">Invoice No.</span>
            <input
              required
              value={invoiceNo}
              onChange={(e) => setInvoiceNo(e.target.value)}
              className="input"
              style={{ marginTop: "0.25rem" }}
            />
          </label>
          <label style={{ display: "block" }}>
            <span className="field-label">Invoice Date</span>
            <input
              required
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={invoiceDateText}
              onChange={(e) => handleDateChange(e.target.value)}
              maxLength={8}
              className="input"
              style={{ marginTop: "0.25rem" }}
            />
            {invoiceDateError && (
              <span className="field-error">{invoiceDateError}</span>
            )}
          </label>
        </div>

        <div>
          <div className="field-label" style={{ marginBottom: "0.5rem" }}>
            Quantity Billed per Item (kg)
          </div>
          <div className="item-list">
            {items.map((it) => (
              <div key={it.id} className="item-list-row">
                <div className="item-list-desc">
                  <span className="item-list-sr">{it.srNo}</span>
                  {it.description}
                  <span className="item-list-bal">(bal. {fmtNum(it.balanceQty, 2)} kg)</span>
                </div>
                <input
                  type="number"
                  step="0.01"
                  value={allocations[it.id]}
                  onChange={(e) =>
                    setAllocations({ ...allocations, [it.id]: e.target.value })
                  }
                  className="item-list-input"
                />
              </div>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className={`advanced-toggle${showAdvanced ? " open" : ""}`}
        >
          <ChevronDown size={14} />
          Manual overrides (Mat. Advance / TDS / Round Off)
        </button>

        {showAdvanced && (
          <div className="form-row-3">
            <label style={{ display: "block" }}>
              <span className="field-label">Mat. Advance (₹)</span>
              <input
                type="number"
                value={matAdvanceOverride}
                onChange={(e) => setMatAdvanceOverride(e.target.value)}
                className="input"
                style={{ marginTop: "0.25rem" }}
              />
            </label>
            <label style={{ display: "block" }}>
              <span className="field-label">TDS (₹)</span>
              <input
                type="number"
                value={tdsOverride}
                onChange={(e) => setTdsOverride(e.target.value)}
                className="input"
                style={{ marginTop: "0.25rem" }}
              />
            </label>
            <label style={{ display: "block" }}>
              <span className="field-label">Round Off (₹)</span>
              <input
                type="number"
                value={roundOffOverride}
                onChange={(e) => setRoundOffOverride(e.target.value)}
                className="input"
                style={{ marginTop: "0.25rem" }}
              />
            </label>
          </div>
        )}

        <div className="modal-actions">
          <button type="button" onClick={onCancel} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" className="btn-primary">
            Save Invoice
          </button>
        </div>
      </form>
    </div>
  );
}