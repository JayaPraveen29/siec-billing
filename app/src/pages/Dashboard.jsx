import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Trash2, ArrowUpRight } from "lucide-react";
import {
  createPOSheet,
  deletePOSheet,
  fetchAllPOData,
  subscribePOSheets,
} from "../services/poService";
import { computePOLedger } from "../utils/ledger";
import { fmtINR, fmtNum } from "../utils/format";
import StatCard from "../components/StatCard";
import Loading from "../components/Loading";
import ConfirmDialog from "../components/ConfirmDialog";
import TitleBlock from "../components/TitleBlock";

const emptyForm = {
  poNumber: "",
  title: "",
  unitRate: "",
  gstPercent: "18",
  tdsPercent: "0.1",
  matAdvPercent: "20",
  openingMatAdvance: "",
};

export default function Dashboard() {
  const [poSheets, setPoSheets] = useState(null);
  const [summary, setSummary] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const unsub = subscribePOSheets(setPoSheets);
    return unsub;
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchAllPOData().then((all) => {
      if (cancelled) return;
      const totals = all.reduce(
        (acc, { po, items, invoices }) => {
          const ledger = computePOLedger(po, items, invoices);
          acc.netReceivable += ledger.totals.netReceivable;
          acc.received += ledger.totals.paymentReceived;
          acc.balance += ledger.totals.balanceToReceive;
          acc.weightPending += ledger.totals.balanceQty;
          return acc;
        },
        { netReceivable: 0, received: 0, balance: 0, weightPending: 0 }
      );
      setSummary(totals);
    });
    return () => {
      cancelled = true;
    };
  }, [poSheets, refreshKey]);

  async function handleCreate(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await createPOSheet({
        code: form.poNumber.trim(),
        poNumber: form.poNumber.trim(),
        title: form.title.trim(),
        unitRate: Number(form.unitRate) || 0,
        gstPercent: Number(form.gstPercent) || 0,
        tdsPercent: Number(form.tdsPercent) || 0,
        matAdvPercent: Number(form.matAdvPercent) || 0,
        openingMatAdvance: Number(form.openingMatAdvance) || 0,
      });
      setForm(emptyForm);
      setShowForm(false);
      setRefreshKey((k) => k + 1);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!toDelete) return;
    await deletePOSheet(toDelete);
    setToDelete(null);
    setRefreshKey((k) => k + 1);
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <TitleBlock
        docType="Purchase Order Register"
        fields={[
          { label: "PO Sheets", value: poSheets ? poSheets.length : "—" },
          { label: "Date", value: new Date().toLocaleDateString("en-GB") },
        ]}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
        <StatCard
          label="Net Receivable"
          value={summary ? fmtINR(summary.netReceivable) : "…"}
        />
        <StatCard
          label="Payment Received"
          value={summary ? fmtINR(summary.received) : "…"}
          accent="ok"
        />
        <StatCard
          label="Balance to Receive"
          value={summary ? fmtINR(summary.balance) : "…"}
          accent={summary && summary.balance > 0 ? "warn" : "ok"}
        />
        <StatCard
          label="Wt. Pending Billing"
          value={summary ? `${fmtNum(summary.weightPending, 1)} kg` : "…"}
          accent="rivet"
        />
      </div>

      <div className="flex items-center justify-between mt-10 mb-4">
        <h2 className="font-display text-2xl tracking-wide">PO Sheets</h2>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-rivet text-ink px-4 py-2 rounded-sm text-sm font-display uppercase tracking-wide hover:brightness-110 transition"
        >
          <Plus size={16} /> New PO Sheet
        </button>
      </div>

      {poSheets === null && <Loading label="Loading PO sheets" />}

      {poSheets && poSheets.length === 0 && (
        <div className="border border-dashed border-line rounded-sm py-14 text-center text-muted">
          No PO sheets yet. Create one to start entering invoices.
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {poSheets?.map((po) => (
          <div
            key={po.id}
            className="group bg-plate border border-line rounded-sm p-5 hover:border-rivet transition relative"
          >
            <button
              onClick={() => setToDelete(po.id)}
              className="absolute top-3 right-3 text-muted hover:text-warn opacity-0 group-hover:opacity-100 transition"
              title="Delete PO sheet"
            >
              <Trash2 size={16} />
            </button>
            <Link to={`/po/${po.id}`} className="block">
              <div className="text-[11px] uppercase tracking-widest text-rivet font-mono">
                {po.poNumber}
              </div>
              <div className="font-display text-2xl mt-1 flex items-center gap-2">
                {po.code}
                <ArrowUpRight
                  size={18}
                  className="text-muted group-hover:text-rivet transition"
                />
              </div>
              <div className="text-sm text-muted mt-1 line-clamp-2">
                {po.title || "No description"}
              </div>
              <div className="flex gap-4 mt-4 text-xs font-mono text-muted">
                <span>Rate ₹{fmtNum(po.unitRate, 2)}/kg</span>
                <span>GST {po.gstPercent}%</span>
                <span>Mat. Adv. {po.matAdvPercent}%</span>
              </div>
            </Link>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <form
            onSubmit={handleCreate}
            className="bg-plate border border-line rounded-sm w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <h3 className="font-display text-2xl tracking-wide">New PO Sheet</h3>

            <Field label="PO Number">
              <input
                required
                value={form.poNumber}
                onChange={(e) => setForm({ ...form, poNumber: e.target.value })}
                placeholder="3710057452 - 127 BR"
                className="input"
              />
            </Field>

            <Field label="Description / Scope">
              <textarea
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Enter the description or scope of work for this PO"
                rows={3}
                className="input resize-none"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Unit Rate (₹/kg)">
                <input
                  required
                  type="number"
                  step="0.01"
                  value={form.unitRate}
                  onChange={(e) => setForm({ ...form, unitRate: e.target.value })}
                  className="input"
                />
              </Field>
              <Field label="Opening Material Advance (₹)">
                <input
                  type="number"
                  value={form.openingMatAdvance}
                  onChange={(e) =>
                    setForm({ ...form, openingMatAdvance: e.target.value })
                  }
                  className="input"
                />
              </Field>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Field label="GST %">
                <input
                  type="number"
                  step="0.01"
                  value={form.gstPercent}
                  onChange={(e) => setForm({ ...form, gstPercent: e.target.value })}
                  className="input"
                />
              </Field>
              <Field label="TDS %">
                <input
                  type="number"
                  step="0.01"
                  value={form.tdsPercent}
                  onChange={(e) => setForm({ ...form, tdsPercent: e.target.value })}
                  className="input"
                />
              </Field>
              <Field label="Mat. Adv. %">
                <input
                  type="number"
                  step="0.01"
                  value={form.matAdvPercent}
                  onChange={(e) =>
                    setForm({ ...form, matAdvPercent: e.target.value })
                  }
                  className="input"
                />
              </Field>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm rounded-sm border border-line text-muted hover:text-paper transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-sm rounded-sm bg-rivet text-ink font-display uppercase tracking-wide hover:brightness-110 transition disabled:opacity-50"
              >
                {saving ? "Creating…" : "Create Sheet"}
              </button>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog
        open={!!toDelete}
        title="Delete PO sheet?"
        message="This removes the PO sheet from the register. Items and invoices under it will remain orphaned in the database unless removed manually."
        onCancel={() => setToDelete(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-widest text-muted font-display">
        {label}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
