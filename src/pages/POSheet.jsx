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
  const [showAdvanced, setShowAdvanced] = useState(false);

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
      <div className="p-8">
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
    <div className="p-4 sm:p-8 max-w-7xl mx-auto">
      <button
        onClick={() => navigate("/")}
        className="flex items-center gap-2 text-muted hover:text-paper text-sm mb-4 transition"
      >
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
      {po.title && <p className="text-muted text-sm mt-3">{po.title}</p>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mt-6">
        <StatCard
          label="Total Weight"
          value={`${fmtNum(ledger.totals.weightKg, 1)} kg`}
        />
        <StatCard
          label="Balance Weight"
          value={`${fmtNum(ledger.totals.balanceQty, 1)} kg`}
          accent={ledger.totals.balanceQty > 0 ? "warn" : "ok"}
        />
        <StatCard
          label="Net Receivable"
          value={fmtINR(ledger.totals.netReceivable)}
        />
        <StatCard
          label="Balance to Receive"
          value={fmtINR(ledger.totals.balanceToReceive)}
          accent={ledger.totals.balanceToReceive > 0 ? "warn" : "ok"}
        />
      </div>

      {/* ITEMS */}
      <section className="mt-8 sm:mt-10">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="font-display text-2xl tracking-wide">Items</h2>
          <button
            onClick={() => setItemModal({ mode: "new", data: emptyItem })}
            className="flex items-center gap-2 bg-plate2 border border-line hover:border-rivet px-3 py-1.5 rounded-sm text-sm transition"
          >
            <Plus size={15} /> Add Item
          </button>
        </div>
        <div className="overflow-x-auto border border-line rounded-sm">
          <table className="w-full ledger-table text-sm">
            <thead className="bg-plate2">
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
                <tr key={it.id} className="hover:bg-plate2/60 group">
                  <td className="font-mono">{it.srNo}</td>
                  <td>{it.description}</td>
                  <td className="text-right font-mono tabular">
                    {fmtNum(it.weightKg, 2)}
                  </td>
                  <td className="text-right font-mono tabular text-muted">
                    {fmtNum(it.allocated, 2)}
                  </td>
                  <td
                    className={`text-right font-mono tabular ${
                      it.balanceQty > 0.001 ? "text-warn" : "text-ok"
                    }`}
                  >
                    {fmtNum(it.balanceQty, 2)}
                  </td>
                  <td>
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition justify-end">
                      <button
                        onClick={() => setItemModal({ mode: "edit", data: it })}
                        className="text-muted hover:text-rivet"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => setDeleteTarget({ type: "item", id: it.id })}
                        className="text-muted hover:text-warn"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {ledger.itemRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-muted py-6">
                    No items yet.
                  </td>
                </tr>
              )}
            </tbody>
            {ledger.itemRows.length > 0 && (
              <tfoot>
                <tr className="bg-plate2 font-semibold">
                  <td colSpan={2}>Total</td>
                  <td className="text-right font-mono tabular">
                    {fmtNum(ledger.totals.weightKg, 2)}
                  </td>
                  <td className="text-right font-mono tabular">
                    {fmtNum(ledger.totals.qty, 2)}
                  </td>
                  <td className="text-right font-mono tabular">
                    {fmtNum(ledger.totals.balanceQty, 2)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      {/* INVOICES */}
      <section className="mt-8 sm:mt-10">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="font-display text-2xl tracking-wide">Invoice</h2>
          <button
            onClick={() => setInvoiceModal({ mode: "new", data: null })}
            disabled={ledger.itemRows.length === 0}
            className="flex items-center gap-2 bg-rivet text-ink px-3 py-1.5 rounded-sm text-sm font-display uppercase tracking-wide hover:brightness-110 transition disabled:opacity-40"
          >
            <Plus size={15} /> Add Invoice
          </button>
        </div>

        <div className="overflow-x-auto border border-line rounded-sm">
          <table className="w-full ledger-table text-sm">
            <thead className="bg-plate2">
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
                <tr key={inv.id} className="hover:bg-plate2/60 group">
                  <td className="font-mono">{inv.invoiceNo}</td>
                  <td className="font-mono">{fmtDate(inv.invoiceDate)}</td>
                  <td className="text-right font-mono tabular">{fmtNum(inv.qty, 2)}</td>
                  <td className="text-right font-mono tabular">{fmtNum(inv.basic, 0)}</td>
                  <td className="text-right font-mono tabular">{fmtNum(inv.gst, 0)}</td>
                  <td className="text-right font-mono tabular">{fmtNum(inv.roundOff, 0)}</td>
                  <td className="text-right font-mono tabular font-semibold">
                    {fmtNum(inv.totalInvoiceValue, 0)}
                  </td>
                  <td className="text-right font-mono tabular">{fmtNum(inv.matAdvance, 0)}</td>
                  <td className="text-right font-mono tabular">{fmtNum(inv.tds, 0)}</td>
                  <td className="text-right font-mono tabular font-semibold text-rivet2">
                    {fmtNum(inv.netReceivable, 0)}
                  </td>
                  <td className="text-right font-mono tabular text-muted">
                    {fmtNum(inv.matAdvanceBalance, 0)}
                  </td>
                  <td className="text-right font-mono tabular">
                    {fmtNum(inv.paymentReceived, 0)}
                  </td>
                  <td className="font-mono">{fmtDate(inv.paymentDate)}</td>
                  <td
                    className={`text-right font-mono tabular ${
                      inv.balanceToReceive > 0.5 ? "text-warn" : "text-ok"
                    }`}
                  >
                    {fmtNum(inv.balanceToReceive, 0)}
                  </td>
                  <td className="text-right font-mono tabular text-muted">
                    {inv.days ?? "-"}
                  </td>
                  <td>
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition justify-end">
                      <button
                        onClick={() => setInvoiceModal({ mode: "edit", data: inv })}
                        className="text-muted hover:text-rivet"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() =>
                          setDeleteTarget({ type: "invoice", id: inv.id })
                        }
                        className="text-muted hover:text-warn"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {ledger.invoiceRows.length === 0 && (
                <tr>
                  <td colSpan={16} className="text-center text-muted py-6">
                    No invoices raised yet.
                  </td>
                </tr>
              )}
            </tbody>
            {ledger.invoiceRows.length > 0 && (
              <tfoot>
                <tr className="bg-plate2 font-semibold">
                  <td colSpan={2}>Total</td>
                  <td className="text-right font-mono tabular">{fmtNum(ledger.totals.qty, 2)}</td>
                  <td className="text-right font-mono tabular">{fmtNum(ledger.totals.basic, 0)}</td>
                  <td className="text-right font-mono tabular">{fmtNum(ledger.totals.gst, 0)}</td>
                  <td className="text-right font-mono tabular">{fmtNum(ledger.totals.roundOff, 0)}</td>
                  <td className="text-right font-mono tabular">
                    {fmtNum(ledger.totals.totalInvoiceValue, 0)}
                  </td>
                  <td className="text-right font-mono tabular">{fmtNum(ledger.totals.matAdvance, 0)}</td>
                  <td className="text-right font-mono tabular">{fmtNum(ledger.totals.tds, 0)}</td>
                  <td className="text-right font-mono tabular text-rivet2">
                    {fmtNum(ledger.totals.netReceivable, 0)}
                  </td>
                  <td className="text-right font-mono tabular">{fmtNum(ledger.matAdvanceBalance, 0)}</td>
                  <td className="text-right font-mono tabular">
                    {fmtNum(ledger.totals.paymentReceived, 0)}
                  </td>
                  <td></td>
                  <td className="text-right font-mono tabular">
                    {fmtNum(ledger.totals.balanceToReceive, 0)}
                  </td>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave({
            srNo: Number(form.srNo) || 0,
            description: form.description.trim(),
            weightKg: Number(form.weightKg) || 0,
          });
        }}
        className="bg-plate border border-line rounded-sm w-full max-w-md p-4 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <h3 className="font-display text-2xl tracking-wide">
          {mode === "new" ? "Item" : "Edit Item"}
        </h3>
        <label className="block">
          <span className="text-[11px] uppercase tracking-widest text-muted font-display">
            No.
          </span>
          <input
            required
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={form.srNo}
            onChange={(e) => setForm({ ...form, srNo: e.target.value })}
            placeholder="e.g. 1"
            className="input mt-1"
          />
        </label>
        <label className="block">
          <span className="text-[11px] uppercase tracking-widest text-muted font-display">
            Description
          </span>
          <input
            required
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="input mt-1"
          />
        </label>
        <label className="block">
          <span className="text-[11px] uppercase tracking-widest text-muted font-display">
            Weight (kg)
          </span>
          <input
            required
            type="number"
            step="0.01"
            value={form.weightKg}
            onChange={(e) => setForm({ ...form, weightKg: e.target.value })}
            className="input mt-1"
          />
        </label>
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded-sm border border-line text-muted hover:text-paper transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 text-sm rounded-sm bg-rivet text-ink font-display uppercase tracking-wide hover:brightness-110 transition"
          >
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <form
        onSubmit={submit}
        className="bg-plate border border-line rounded-sm w-full max-w-2xl p-4 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <h3 className="font-display text-2xl tracking-wide">
          {mode === "new" ? "Add Invoice" : "Edit Invoice"}
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[11px] uppercase tracking-widest text-muted font-display">
              Invoice No.
            </span>
            <input
              required
              value={invoiceNo}
              onChange={(e) => setInvoiceNo(e.target.value)}
              className="input mt-1"
            />
          </label>
          <label className="block">
            <span className="text-[11px] uppercase tracking-widest text-muted font-display">
              Invoice Date
            </span>
            <input
              required
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
              className="input mt-1"
            />
          </label>
        </div>

        <div>
          <div className="text-[11px] uppercase tracking-widest text-muted font-display mb-2">
            Quantity Billed per Item (kg)
          </div>
          <div className="border border-line rounded-sm divide-y divide-line max-h-48 overflow-y-auto">
            {items.map((it) => (
              <div
                key={it.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
              >
                <div className="text-sm min-w-0">
                  <span className="font-mono text-muted mr-2">{it.srNo}</span>
                  {it.description}
                  <span className="text-xs text-muted ml-2">
                    (bal. {fmtNum(it.balanceQty, 2)} kg)
                  </span>
                </div>
                <input
                  type="number"
                  step="0.01"
                  value={allocations[it.id]}
                  onChange={(e) =>
                    setAllocations({ ...allocations, [it.id]: e.target.value })
                  }
                  className="w-24 sm:w-28 bg-ink border border-line rounded-sm px-2 py-1 text-sm text-right font-mono focus:border-rivet outline-none shrink-0"
                  placeholder="0"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[11px] uppercase tracking-widest text-muted font-display">
              Payment Received (₹)
            </span>
            <input
              type="number"
              value={paymentReceived}
              onChange={(e) => setPaymentReceived(e.target.value)}
              className="input mt-1"
            />
          </label>
          <label className="block">
            <span className="text-[11px] uppercase tracking-widest text-muted font-display">
              Payment Date
            </span>
            <input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className="input mt-1"
            />
          </label>
        </div>

        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="flex items-center gap-1 text-xs text-muted hover:text-paper transition"
        >
          <ChevronDown
            size={14}
            className={`transition-transform ${showAdvanced ? "rotate-180" : ""}`}
          />
          Manual overrides (Mat. Advance / TDS / Round Off)
        </button>

        {showAdvanced && (
          <div className="grid grid-cols-3 gap-3">
            <label className="block">
              <span className="text-[11px] uppercase tracking-widest text-muted font-display">
                Mat. Advance (₹)
              </span>
              <input
                type="number"
                value={matAdvanceOverride}
                onChange={(e) => setMatAdvanceOverride(e.target.value)}
                placeholder="auto"
                className="input mt-1"
              />
            </label>
            <label className="block">
              <span className="text-[11px] uppercase tracking-widest text-muted font-display">
                TDS (₹)
              </span>
              <input
                type="number"
                value={tdsOverride}
                onChange={(e) => setTdsOverride(e.target.value)}
                placeholder="auto"
                className="input mt-1"
              />
            </label>
            <label className="block">
              <span className="text-[11px] uppercase tracking-widest text-muted font-display">
                Round Off (₹)
              </span>
              <input
                type="number"
                value={roundOffOverride}
                onChange={(e) => setRoundOffOverride(e.target.value)}
                placeholder="auto"
                className="input mt-1"
              />
            </label>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded-sm border border-line text-muted hover:text-paper transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 text-sm rounded-sm bg-rivet text-ink font-display uppercase tracking-wide hover:brightness-110 transition"
          >
            Save Invoice
          </button>
        </div>
      </form>
    </div>
  );
}
