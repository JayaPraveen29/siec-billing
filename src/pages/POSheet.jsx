import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Plus, Pencil, Trash2, ChevronDown } from "lucide-react";
import {
  addInvoice,
  addItem,
  deleteInvoice,
  deleteItem,
  subscribeInvoices,
  subscribeItems,
  subscribePOSheets,
  updateInvoice,
  updateItem,
  updatePOSheet,
} from "../services/poService";
import { computePOLedger } from "../utils/ledger";
import { fmtINR, fmtNum, fmtDate, toInputDate } from "../utils/format";
import TitleBlock from "../components/TitleBlock";
import Loading from "../components/Loading";
import ConfirmDialog from "../components/ConfirmDialog";
import StatCard from "../components/StatCard";
import "./POSheet.css";

const emptyItem = { srNo: "", description: "", weightKg: "" };

export default function POSheet() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [po, setPo] = useState(null);
  const [items, setItems] = useState(null);
  const [invoices, setInvoices] = useState(null);

  const [itemModal, setItemModal] = useState(null); // {mode:'new'|'edit', data}
  const [invoiceModal, setInvoiceModal] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null); // {type, id}

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

  return (
    <div className="po-page">
      <button onClick={() => navigate("/")} className="back-link">
        <ArrowLeft size={15} /> Back to register
      </button>

      <TitleBlock
        docType="PO Billing Ledger"
        fields={[
          { label: "PO No.", value: po.poNumber },
          { label: "Sheet Code", value: po.code },
          { label: "Unit Rate", value: `₹${fmtNum(po.unitRate, 2)}/kg` },
          { label: "GST", value: `${po.gstPercent}%` },
        ]}
      />
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

      {/* ITEMS */}
      <section className="po-section">
        <div className="po-section-header">
          <h2 className="section-title">Items</h2>
          <button
            onClick={() => setItemModal({ mode: "new", data: emptyItem })}
            className="btn-outline"
          >
            <Plus size={15} /> Add Item
          </button>
        </div>
        <div className="table-scroll">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>No.</th>
                <th>Description</th>
                <th className="text-right">Wt./Kg</th>
                <th className="text-right">Allocated</th>
                <th className="text-right">Balance</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {ledger.itemRows.map((it) => (
                <tr key={it.id}>
                  <td>{it.srNo}</td>
                  <td>{it.description}</td>
                  <td className="text-right tabular">{fmtNum(it.weightKg, 2)}</td>
                  <td className="text-right tabular text-muted">{fmtNum(it.allocated, 2)}</td>
                  <td className={`text-right tabular ${it.balanceQty > 0.001 ? "text-warn" : "text-ok"}`}>
                    {fmtNum(it.balanceQty, 2)}
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
                  <td colSpan={6} className="text-center text-muted" style={{ padding: "1.5rem 0" }}>
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
                  <td className="text-right tabular">{fmtNum(ledger.totals.qty, 2)}</td>
                  <td className="text-right tabular">{fmtNum(ledger.totals.balanceQty, 2)}</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      {/* INVOICES */}
      <section className="po-section">
        <div className="po-section-header">
          <h2 className="section-title">Invoice</h2>
          <button
            onClick={() => setInvoiceModal({ mode: "new", data: null })}
            disabled={ledger.itemRows.length === 0}
            className="btn-primary"
          >
            <Plus size={15} /> Add Invoice
          </button>
        </div>

        <div className="table-scroll">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Inv. No.</th>
                <th>Date</th>
                <th className="text-right">Wt./Kg</th>
                <th className="text-right">Basic</th>
                <th className="text-right">GST</th>
                <th className="text-right">Round Off</th>
                <th className="text-right">Total Inv.</th>
                <th className="text-right">Mat. Adv.</th>
                <th className="text-right">TDS</th>
                <th className="text-right">Net Recv.</th>
                <th className="text-right">Adv. Bal.</th>
                <th className="text-right">Payment</th>
                <th>Paid On</th>
                <th className="text-right">Balance</th>
                <th className="text-right">Days</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {ledger.invoiceRows.map((inv) => (
                <tr key={inv.id}>
                  <td>{inv.invoiceNo}</td>
                  <td>{fmtDate(inv.invoiceDate)}</td>
                  <td className="text-right tabular">{fmtNum(inv.qty, 2)}</td>
                  <td className="text-right tabular">{fmtNum(inv.basic, 0)}</td>
                  <td className="text-right tabular">{fmtNum(inv.gst, 0)}</td>
                  <td className="text-right tabular">{fmtNum(inv.roundOff, 0)}</td>
                  <td className="text-right tabular" style={{ fontWeight: 600 }}>
                    {fmtNum(inv.totalInvoiceValue, 0)}
                  </td>
                  <td className="text-right tabular">{fmtNum(inv.matAdvance, 0)}</td>
                  <td className="text-right tabular">{fmtNum(inv.tds, 0)}</td>
                  <td className="text-right tabular text-rivet2" style={{ fontWeight: 600 }}>
                    {fmtNum(inv.netReceivable, 0)}
                  </td>
                  <td className="text-right tabular text-muted">{fmtNum(inv.matAdvanceBalance, 0)}</td>
                  <td className="text-right tabular">{fmtNum(inv.paymentReceived, 0)}</td>
                  <td>{fmtDate(inv.paymentDate)}</td>
                  <td className={`text-right tabular ${inv.balanceToReceive > 0.5 ? "text-warn" : "text-ok"}`}>
                    {fmtNum(inv.balanceToReceive, 0)}
                  </td>
                  <td className="text-right tabular text-muted">{inv.days ?? "-"}</td>
                  <td>
                    <div className="row-actions">
                      <button
                        onClick={() => setInvoiceModal({ mode: "edit", data: inv })}
                        className="edit-btn"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => setDeleteTarget({ type: "invoice", id: inv.id })}
                        className="delete-btn"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {ledger.invoiceRows.length === 0 && (
                <tr>
                  <td colSpan={16} className="text-center text-muted" style={{ padding: "1.5rem 0" }}>
                    No invoices raised yet.
                  </td>
                </tr>
              )}
            </tbody>
            {ledger.invoiceRows.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={2}>Total</td>
                  <td className="text-right tabular">{fmtNum(ledger.totals.qty, 2)}</td>
                  <td className="text-right tabular">{fmtNum(ledger.totals.basic, 0)}</td>
                  <td className="text-right tabular">{fmtNum(ledger.totals.gst, 0)}</td>
                  <td className="text-right tabular">{fmtNum(ledger.totals.roundOff, 0)}</td>
                  <td className="text-right tabular">{fmtNum(ledger.totals.totalInvoiceValue, 0)}</td>
                  <td className="text-right tabular">{fmtNum(ledger.totals.matAdvance, 0)}</td>
                  <td className="text-right tabular">{fmtNum(ledger.totals.tds, 0)}</td>
                  <td className="text-right tabular text-rivet2">{fmtNum(ledger.totals.netReceivable, 0)}</td>
                  <td className="text-right tabular">{fmtNum(ledger.matAdvanceBalance, 0)}</td>
                  <td className="text-right tabular">{fmtNum(ledger.totals.paymentReceived, 0)}</td>
                  <td></td>
                  <td className="text-right tabular">{fmtNum(ledger.totals.balanceToReceive, 0)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

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
            placeholder="e.g. 1"
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

function InvoiceModal({ mode, data, items, onCancel, onSave }) {
  const [invoiceNo, setInvoiceNo] = useState(data?.invoiceNo ?? "");
  const [invoiceDate, setInvoiceDate] = useState(toInputDate(data?.invoiceDate) || "");
  const [paymentReceived, setPaymentReceived] = useState(data?.paymentReceived ?? "");
  const [paymentDate, setPaymentDate] = useState(toInputDate(data?.paymentDate) || "");
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

  function submit(e) {
    e.preventDefault();
    const cleanAllocations = {};
    Object.entries(allocations).forEach(([k, v]) => {
      if (v !== "" && Number(v) !== 0) cleanAllocations[k] = Number(v);
    });
    onSave({
      invoiceNo: invoiceNo.trim(),
      invoiceDate,
      allocations: cleanAllocations,
      paymentReceived: Number(paymentReceived) || 0,
      paymentDate: paymentDate || null,
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
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
              className="input"
              style={{ marginTop: "0.25rem" }}
            />
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
                  placeholder="0"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="form-row-2">
          <label style={{ display: "block" }}>
            <span className="field-label">Payment Received (₹)</span>
            <input
              type="number"
              value={paymentReceived}
              onChange={(e) => setPaymentReceived(e.target.value)}
              className="input"
              style={{ marginTop: "0.25rem" }}
            />
          </label>
          <label style={{ display: "block" }}>
            <span className="field-label">Payment Date</span>
            <input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className="input"
              style={{ marginTop: "0.25rem" }}
            />
          </label>
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
                placeholder="auto"
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
                placeholder="auto"
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
                placeholder="auto"
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
