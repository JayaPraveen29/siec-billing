import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Trash2, ArrowUpRight } from "lucide-react";
import {
  createPOSheet,
  deletePOSheet,
  fetchAllPOData,
  subscribePOSheets,
} from "../../services/poService";
import { computePOLedger } from "../../utils/ledger";
import { fmtINR, fmtNum } from "../../utils/format";
import StatCard from "../../components/StatCard";
import Loading from "../../components/Loading";
import ConfirmDialog from "../../components/ConfirmDialog";
import TitleBlock from "../../components/TitleBlock";
import "./Dashboard.css";

const emptyForm = {
  poNumber: "",
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
    <div className="page">
      <TitleBlock
        docType="Purchase Order Register"
        fields={[
          { label: "PO Sheets", value: poSheets ? poSheets.length : "—" },
          { label: "Date", value: new Date().toLocaleDateString("en-GB") },
        ]}
      />

      <div className="stat-grid">
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

      <div className="section-header">
        <h2 className="section-title">PO Sheets</h2>
        <button onClick={() => setShowForm(true)} className="btn-primary">
          <Plus size={16} /> New PO Sheet
        </button>
      </div>

      {poSheets === null && <Loading label="Loading PO sheets" />}

      {poSheets && poSheets.length === 0 && (
        <div className="empty-state">
          No PO sheets yet. Create one to start entering invoices.
        </div>
      )}

      <div className="po-grid">
        {poSheets?.map((po) => (
          <div key={po.id} className="po-card">
            <button
              onClick={() => setToDelete(po.id)}
              className="po-card-delete"
              title="Delete PO sheet"
            >
              <Trash2 size={16} />
            </button>
            <Link to={`/po/${po.id}`} className="po-card-link">
              <div className="po-card-po-number">{po.poNumber}</div>
              <div className="po-card-code">
                {po.code}
                <ArrowUpRight size={18} className="po-card-code-arrow" />
              </div>
              {po.title && <div className="po-card-desc">{po.title}</div>}
              <div className="po-card-meta">
                <span>Rate ₹{fmtNum(po.unitRate, 2)}/kg</span>
                <span>GST {po.gstPercent}%</span>
                <span>Mat. Adv. {po.matAdvPercent}%</span>
              </div>
            </Link>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="modal-overlay">
          <form onSubmit={handleCreate} className="modal-panel dashboard-form">
            <h3 className="modal-title">New PO Sheet</h3>

            <Field label="PO Number">
              <input
                required
                value={form.poNumber}
                onChange={(e) => setForm({ ...form, poNumber: e.target.value })}
                placeholder="3710057452 - 127 BR"
                className="input"
              />
            </Field>

            <div className="form-row-2">
              <Field label="Unit Rate (₹/kg)">
                <input
                  type="number"
                  step="0.01"
                  value={form.unitRate}
                  onChange={(e) => setForm({ ...form, unitRate: e.target.value })}
                  placeholder="120.95"
                  className="input"
                />
              </Field>
              <Field label="Mat. Adv.:">
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

            <div className="form-row-3">
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

            <div className="modal-actions">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button type="submit" disabled={saving} className="btn-primary">
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
    <label style={{ display: "block" }}>
      <span className="field-label">{label}</span>
      <div style={{ marginTop: "0.25rem" }}>{children}</div>
    </label>
  );
}