import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Trash2, ArrowUpRight } from "lucide-react";
import {
  createPOSheet,
  deletePOSheet,
  fetchAllPOData,
  subscribePOSheets,
} from "../../services/poService";
import { computePOLedger, effectiveMatAdvPercent } from "../../utils/ledger";
import { fmtINR, fmtNum , fmtToday } from "../../utils/format";
import StatCard from "../../components/StatCard";
import Loading from "../../components/Loading";
import ConfirmDialog from "../../components/ConfirmDialog";
import { PO_GROUPS, WORK_TYPES, WORK_NOT_SET, matchesGroup, matchesWorkType } from "../../utils/groups";
import { companyName } from "../../utils/format";
import TitleBlock from "../../components/TitleBlock";
import "./Dashboard.css";

// Filter tabs: Group (SIEC / ST) and Work Type (STRL / CT).
const GROUP_FILTERS = ["All", ...PO_GROUPS];
const WORK_TYPE_FILTERS = ["All", ...WORK_TYPES, WORK_NOT_SET];
const workTypeLabel = (w) => (w === "All" ? "All Work Types" : w === WORK_NOT_SET ? "Not Set" : w);

const emptyForm = {
  poNumber: "",
  group: "",
  workType: "",
  unitRate: "",
  gstPercent: "18",
  tdsPercent: "0.1",
  matAdvPercent: "20",
  openingMatAdvance: "",
};

export default function Dashboard() {
  const [poSheets, setPoSheets] = useState(null);
  const [allData, setAllData] = useState(null);
  const [groupFilter, setGroupFilter] = useState("All");
  const [workTypeFilter, setWorkTypeFilter] = useState("All");
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
      setAllData(all);
    });
    return () => {
      cancelled = true;
    };
  }, [poSheets, refreshKey]);

  // Summary cards follow the selected group filter (All / group / unit).
  // "Balance to Receive" = the sum, across the visible POs, of each PO sheet's
  // own "Bal to be received" Total (unpaid bills only — see computePOLedger).
  const summary = useMemo(() => {
    if (!allData) return null;
    return allData
      .filter(
        ({ po }) =>
          matchesGroup(po.group || "", groupFilter) &&
          matchesWorkType(po.workType || "", workTypeFilter)
      )
      .reduce(
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
  }, [allData, groupFilter, workTypeFilter]);

  // Per-PO "Bal to be received" total (same figure as on the PO sheet).
  const poBalances = useMemo(() => {
    const map = {};
    (allData || []).forEach(({ po, items, invoices }) => {
      map[po.id] = computePOLedger(po, items, invoices).totals.balanceToReceive;
    });
    return map;
  }, [allData]);

  const groupCounts = useMemo(() => {
    const counts = { All: poSheets ? poSheets.length : 0 };
    GROUP_FILTERS.forEach((g) => {
      counts[g] = poSheets
        ? poSheets.filter(
            (po) => matchesGroup(po.group, g) && matchesWorkType(po.workType, workTypeFilter)
          ).length
        : 0;
    });
    return counts;
  }, [poSheets, workTypeFilter]);

  const workTypeCounts = useMemo(() => {
    const counts = {};
    WORK_TYPE_FILTERS.forEach((w) => {
      counts[w] = poSheets
        ? poSheets.filter(
            (po) => matchesWorkType(po.workType, w) && matchesGroup(po.group, groupFilter)
          ).length
        : 0;
    });
    return counts;
  }, [poSheets, groupFilter]);

  const visiblePOs = useMemo(
    () =>
      poSheets
        ? poSheets.filter(
            (po) =>
              matchesGroup(po.group, groupFilter) &&
              matchesWorkType(po.workType, workTypeFilter)
          )
        : null,
    [poSheets, groupFilter, workTypeFilter]
  );

  async function handleCreate(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await createPOSheet({
        code: form.poNumber.trim(),
        poNumber: form.poNumber.trim(),
        group: form.group,
        workType: form.workType,
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
        company={companyName(groupFilter)}
        docType="Purchase Order Register"
        fields={[
          { label: "PO Sheets", value: visiblePOs ? visiblePOs.length : "—" },
          { label: "Date", value: fmtToday() },
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

      <div className="group-filter" role="tablist" aria-label="Filter by group">
        {GROUP_FILTERS.map((g) => (
          <button
            key={g}
            type="button"
            role="tab"
            aria-selected={groupFilter === g}
            onClick={() => setGroupFilter(g)}
            className={`group-filter-btn${groupFilter === g ? " active" : ""}`}
          >
            {g}
            <span className="group-filter-count">{groupCounts[g]}</span>
          </button>
        ))}
      </div>

      <div className="group-filter" role="tablist" aria-label="Filter by work type">
        {WORK_TYPE_FILTERS.map((w) => (
          <button
            key={w}
            type="button"
            role="tab"
            aria-selected={workTypeFilter === w}
            onClick={() => setWorkTypeFilter(w)}
            className={`group-filter-btn${workTypeFilter === w ? " active" : ""}`}
          >
            {workTypeLabel(w)}
            <span className="group-filter-count">{workTypeCounts[w]}</span>
          </button>
        ))}
      </div>

      {poSheets === null && <Loading label="Loading PO sheets" />}

      {poSheets && poSheets.length === 0 && (
        <div className="empty-state">
          No PO sheets yet. Create one to start entering invoices.
        </div>
      )}

      {poSheets && poSheets.length > 0 && visiblePOs.length === 0 && (
        <div className="empty-state">No {[groupFilter, workTypeFilter === "All" ? "All" : workTypeLabel(workTypeFilter)].filter((v) => v !== "All").join(" ")} PO sheets found.</div>
      )}

      <div className="po-grid">
        {visiblePOs?.map((po) => (
          <div key={po.id} className="po-card">
            <button
              onClick={() => setToDelete(po.id)}
              className="po-card-delete"
              title="Delete PO sheet"
            >
              <Trash2 size={16} />
            </button>
            <Link to={`/po/${po.id}`} className="po-card-link">
              <div className="po-card-top">
                <div className="po-card-po-number">{po.poNumber}</div>
                <span style={{ display: "inline-flex", gap: "0.35rem" }}>
                  {po.group && <span className="po-card-group">{po.group}</span>}
                  {po.workType && <span className="po-card-group">{po.workType}</span>}
                </span>
              </div>
              <div className="po-card-code">
                {po.code}
                <ArrowUpRight size={18} className="po-card-code-arrow" />
              </div>
              {po.title && <div className="po-card-desc">{po.title}</div>}
              <div className="po-card-meta">
                <span>Rate ₹{fmtNum(po.unitRate, 2)}/kg</span>
                <span>GST {po.gstPercent}%</span>
                <span>Mat. Adv. {effectiveMatAdvPercent(po)}%</span>
              </div>
              <div className="po-card-meta">
                <span
                  style={
                    Number(po.matAdvPercent) > 100 ||
                    Number(po.matAdvPercent) < 0 ||
                    poBalances[po.id] < -1
                      ? { color: "var(--color-warn)" }
                      : undefined
                  }
                  title={
                    Number(po.matAdvPercent) > 100 || Number(po.matAdvPercent) < 0
                      ? "Mat. Adv. % is outside 0-100 - please correct it"
                      : poBalances[po.id] < -1
                      ? "Negative balance - more received than billed. Please check this PO"
                      : undefined
                  }
                >
                  Bal to receive:{" "}
                  {poBalances[po.id] === undefined
                    ? "…"
                    : fmtINR(poBalances[po.id])}
                </span>
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

            <Field label="Group">
              <select
                required
                value={form.group}
                onChange={(e) => setForm({ ...form, group: e.target.value })}
                className="input"
              >
                <option value="">Select group</option>
                {PO_GROUPS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Work Type">
              <select
                required
                value={form.workType}
                onChange={(e) => setForm({ ...form, workType: e.target.value })}
                className="input"
              >
                <option value="">Select work type</option>
                {WORK_TYPES.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
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