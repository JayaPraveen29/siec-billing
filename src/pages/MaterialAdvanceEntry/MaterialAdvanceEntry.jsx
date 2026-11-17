import { useEffect, useMemo, useState } from "react";
import { Pencil, Trash2, RefreshCw } from "lucide-react";
import { fetchAllPOData, addInvoice, updateInvoice, deleteInvoice } from "../../services/poService";
import { fmtNum, fmtDate, fmtToday } from "../../utils/format";
import TitleBlock from "../../components/TitleBlock";
import Loading from "../../components/Loading";
import "./MaterialAdvanceEntry.css";

// Material Advance entry.
// A material advance is saved as an ordinary bill on the PO that has NO billed
// quantity and no unit rate / GST / TDS / round off - only a bill number
// (e.g. "MA - 01"), a date and the advance amount, which is the bill's
// Net Receivable. Because it is a normal bill, the PO sheet, Pending Payments
// and the other reports pick it up with no changes. Payment received is
// entered on the PO sheet as for any other bill.

const todayIso = () => new Date().toISOString().slice(0, 10);

function parseAmount(v) {
  const n = parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

// Entries made here carry `isMaterialAdvance`; "MA - 01" style bills typed in
// by hand on the PO sheet earlier are recognised by their bill number.
function isMaEntry(inv) {
  return inv.isMaterialAdvance === true || /^MA\s*-/i.test(String(inv.invoiceNo ?? "").trim());
}

function entryAmount(inv) {
  if (inv.netReceivableOverride !== undefined && inv.netReceivableOverride !== "" && inv.netReceivableOverride !== null)
    return Number(inv.netReceivableOverride) || 0;
  return Number(inv.materialAdvanceAmount) || 0;
}

const emptyForm = { poId: "", invoiceNo: "", invoiceDate: todayIso(), amount: "" };

export default function MaterialAdvanceEntry() {
  const [allData, setAllData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null); // { poId, invoiceId }
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setAllData(await fetchAllPOData());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const entries = useMemo(() => {
    if (!allData) return [];
    const out = [];
    allData.forEach(({ po, invoices }) =>
      invoices.filter(isMaEntry).forEach((inv) => out.push({ po, inv }))
    );
    return out.sort(
      (a, b) =>
        String(a.po.code ?? "").localeCompare(String(b.po.code ?? ""), undefined, { numeric: true }) ||
        String(a.inv.invoiceNo ?? "").localeCompare(String(b.inv.invoiceNo ?? ""), undefined, { numeric: true })
    );
  }, [allData]);

  const selectedPo = allData?.find((d) => d.po.id === form.poId);

  // Suggest the next MA number for the chosen PO ("MA - 01", "MA - 02", ...).
  function suggestNo(poId) {
    const d = allData?.find((x) => x.po.id === poId);
    const n = (d ? d.invoices.filter(isMaEntry).length : 0) + 1;
    return `MA - ${String(n).padStart(2, "0")}`;
  }

  function handlePoChange(poId) {
    setError("");
    setForm((f) => ({ ...f, poId, invoiceNo: poId && !editing ? suggestNo(poId) : f.invoiceNo }));
  }

  function resetForm() {
    setEditing(null);
    setError("");
    setForm({ ...emptyForm, invoiceDate: todayIso() });
  }

  function startEdit({ po, inv }) {
    setEditing({ poId: po.id, invoiceId: inv.id });
    setError("");
    setForm({
      poId: po.id,
      invoiceNo: inv.invoiceNo ?? "",
      invoiceDate: String(inv.invoiceDate ?? "").slice(0, 10),
      amount: String(entryAmount(inv)),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete({ po, inv }) {
    if (!window.confirm(`Delete ${inv.invoiceNo} of PO ${po.code}? This also removes it from the PO sheet.`)) return;
    await deleteInvoice(po.id, inv.id);
    await load();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const invoiceNo = form.invoiceNo.trim();
    const amount = parseAmount(form.amount);
    if (!form.poId) return setError("Select a PO.");
    if (!invoiceNo) return setError("Enter the Material Advance number, e.g. MA - 01.");
    if (!form.invoiceDate) return setError("Select the date.");
    if (!(amount > 0)) return setError("Enter the advance amount.");

    const clash = selectedPo?.invoices.some(
      (i) => String(i.invoiceNo ?? "").trim().toLowerCase() === invoiceNo.toLowerCase() && i.id !== editing?.invoiceId
    );
    if (clash) return setError(`${invoiceNo} already exists on this PO. Use another number.`);

    setError("");
    setSaving(true);
    try {
      if (editing) {
        await updateInvoice(editing.poId, editing.invoiceId, {
          invoiceNo,
          invoiceDate: form.invoiceDate,
          netReceivableOverride: amount,
          materialAdvanceAmount: amount,
        });
      } else {
        await addInvoice(form.poId, {
          invoiceNo,
          invoiceDate: form.invoiceDate,
          // No items / quantity, and nothing to calculate:
          allocations: {},
          unitRateOverride: 0,
          matAdvanceOverride: "NA",
          tdsOverride: 0,
          roundOffOverride: 0,
          // The advance is the amount receivable on this bill.
          netReceivableOverride: amount,
          materialAdvanceAmount: amount,
          isMaterialAdvance: true,
          paymentReceived: 0,
        });
      }
      resetForm();
      await load();
    } catch (err) {
      setError(err?.message || "Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const total = entries.reduce((s, { inv }) => s + entryAmount(inv), 0);

  return (
    <div className="maentry-page">
      <div className="maentry-header">
        <TitleBlock
          docType="MATERIAL ADVANCE ENTRY"
          fields={[
            { label: "Entries", value: loading ? "—" : entries.length },
            { label: "Generated", value: fmtToday() },
          ]}
        />
        <button onClick={load} className="maentry-refresh">
          <RefreshCw size={15} className={loading ? "spinning" : ""} />
          Refresh
        </button>
      </div>

      <form onSubmit={handleSubmit} className="maentry-form">
        <h3 className="maentry-form-title">{editing ? "Edit Material Advance" : "New Material Advance"}</h3>
        <div className="maentry-grid">
          <label className="maentry-field maentry-field-po">
            <span className="field-label">PO</span>
            <select
              className="input"
              value={form.poId}
              onChange={(e) => handlePoChange(e.target.value)}
              disabled={!!editing || loading}
            >
              <option value="">Select PO</option>
              {(allData || []).map(({ po }) => (
                <option key={po.id} value={po.id}>
                  {po.code}
                  {po.projectManager ? ` | PM: ${po.projectManager}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="maentry-field">
            <span className="field-label">MA No.</span>
            <input
              className="input"
              type="text"
              autoComplete="off"
              placeholder="MA - 01"
              value={form.invoiceNo}
              onChange={(e) => setForm({ ...form, invoiceNo: e.target.value })}
            />
          </label>
          <label className="maentry-field">
            <span className="field-label">Date</span>
            <input
              className="input"
              type="date"
              value={form.invoiceDate}
              onChange={(e) => setForm({ ...form, invoiceDate: e.target.value })}
            />
          </label>
          <label className="maentry-field">
            <span className="field-label">Amount (₹)</span>
            <input
              className="input"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="24,86,541"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </label>
        </div>
        {error && <div className="maentry-error">{error}</div>}
        <div className="maentry-buttons">
          <button type="submit" className="btn-primary" disabled={saving || loading}>
            {saving ? "Saving…" : editing ? "Update" : "Save"}
          </button>
          {editing && (
            <button type="button" className="maentry-cancel" onClick={resetForm}>
              Cancel
            </button>
          )}
        </div>
      </form>

      {loading && <Loading label="Loading entries" />}

      {!loading && entries.length > 0 && (
        <div className="table-scroll maentry-table-wrap">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>PO</th>
                <th>MA No.</th>
                <th>Date</th>
                <th className="text-right">Amount</th>
                <th className="text-right">Paid</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((en) => (
                <tr key={`${en.po.id}-${en.inv.id}`}>
                  <td>{en.po.code}</td>
                  <td className="text-rivet">{en.inv.invoiceNo}</td>
                  <td>{fmtDate(en.inv.invoiceDate)}</td>
                  <td className="text-right tabular">{fmtNum(entryAmount(en.inv), 2)}</td>
                  <td className="text-right tabular">{fmtNum(Number(en.inv.paymentReceived) || 0, 2)}</td>
                  <td>
                    <div className="row-actions">
                      <button onClick={() => startEdit(en)} title="Edit">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => handleDelete(en)} title="Delete">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td></td>
                <td></td>
                <td className="text-right tabular">{fmtNum(total, 2)}</td>
                <td></td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {!loading && entries.length === 0 && (
        <div className="empty-state" style={{ marginTop: "1.5rem" }}>
          No material advance entries yet.
        </div>
      )}
    </div>
  );
}
