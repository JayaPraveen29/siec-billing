import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Trash2, ClipboardPaste } from "lucide-react";
import { createPOSheet, addItemsBulk } from "../../services/poService";
import { parseBulkItemsText } from "../PO/POSheet";
import { fmtNum } from "../../utils/format";
import TitleBlock from "../../components/TitleBlock";
import "./POCreate.css";

const emptyForm = {
  poNumber: "",
  unitRate: "",
  gstPercent: "18",
  tdsPercent: "0.1",
  matAdvPercent: "20",
  openingMatAdvance: "",
};

const emptyItemForm = { srNo: "", description: "", weightKg: "" };

export default function POCreate() {
  const navigate = useNavigate();

  const [form, setForm] = useState(emptyForm);
  const [items, setItems] = useState([]); // [{srNo, description, weightKg}]
  const [itemForm, setItemForm] = useState(emptyItemForm);

  const [showBulkPaste, setShowBulkPaste] = useState(false);
  const [bulkText, setBulkText] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const totalWeight = useMemo(
    () => items.reduce((s, it) => s + (Number(it.weightKg) || 0), 0),
    [items]
  );

  function nextSrNo() {
    const nums = items.map((it) => Number(it.srNo) || 0);
    return nums.length ? Math.max(...nums) + 10 : 10;
  }

  function handleAddItem(e) {
    e.preventDefault();
    const description = itemForm.description.trim();
    const weightKg = Number(itemForm.weightKg);
    if (!description || !Number.isFinite(weightKg) || weightKg <= 0) return;
    const srNo = itemForm.srNo === "" ? nextSrNo() : Number(itemForm.srNo) || 0;
    setItems((prev) => [...prev, { srNo, description, weightKg }]);
    setItemForm(emptyItemForm);
  }

  function handleRemoveItem(index) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function handleBulkAdd() {
    const parsed = parseBulkItemsText(bulkText, nextSrNo());
    const valid = parsed.filter((r) => r.valid);
    if (valid.length === 0) return;
    setItems((prev) => [
      ...prev,
      ...valid.map(({ srNo, description, weightKg }) => ({ srNo, description, weightKg })),
    ]);
    setBulkText("");
    setShowBulkPaste(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.poNumber.trim()) {
      setError("PO Number is required.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const ref = await createPOSheet({
        code: form.poNumber.trim(),
        poNumber: form.poNumber.trim(),
        unitRate: Number(form.unitRate) || 0,
        gstPercent: Number(form.gstPercent) || 0,
        tdsPercent: Number(form.tdsPercent) || 0,
        matAdvPercent: Number(form.matAdvPercent) || 0,
        openingMatAdvance: Number(form.openingMatAdvance) || 0,
      });

      if (items.length > 0) {
        await addItemsBulk(
          ref.id,
          items.map(({ srNo, description, weightKg }) => ({
            srNo: Number(srNo) || 0,
            description,
            weightKg: Number(weightKg) || 0,
          }))
        );
      }

      navigate(`/po/${ref.id}`);
    } catch (err) {
      setError("Something went wrong while creating the PO sheet. Please try again.");
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <button onClick={() => navigate("/")} className="back-link">
        <ArrowLeft size={15} /> Back to register
      </button>

      <TitleBlock
        docType="New PO Sheet"
        fields={[
          { label: "Items Added", value: items.length },
          { label: "Total Weight", value: `${fmtNum(totalWeight, 1)} kg` },
        ]}
      />

      <form onSubmit={handleSubmit}>
        {/* --- PO Details --- */}
        <section className="po-section">
          <div className="section-header">
            <h2 className="section-title">PO Details</h2>
          </div>

          <label style={{ display: "block" }}>
            <span className="field-label">PO Number</span>
            <input
              required
              value={form.poNumber}
              onChange={(e) => setForm({ ...form, poNumber: e.target.value })}
              className="input"
              style={{ marginTop: "0.25rem" }}
            />
          </label>

          <div className="form-row-2" style={{ marginTop: "0.75rem" }}>
            <label style={{ display: "block" }}>
              <span className="field-label">Unit Rate (₹/kg)</span>
              <input
                type="number"
                step="0.01"
                value={form.unitRate}
                onChange={(e) => setForm({ ...form, unitRate: e.target.value })}
                className="input"
                style={{ marginTop: "0.25rem" }}
              />
            </label>
            <label style={{ display: "block" }}>
              <span className="field-label">Opening Mat. Advance (₹)</span>
              <input
                type="number"
                value={form.openingMatAdvance}
                onChange={(e) =>
                  setForm({ ...form, openingMatAdvance: e.target.value })
                }
                className="input"
                style={{ marginTop: "0.25rem" }}
              />
            </label>
          </div>

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
                onChange={(e) =>
                  setForm({ ...form, matAdvPercent: e.target.value })
                }
                className="input"
                style={{ marginTop: "0.25rem" }}
              />
            </label>
          </div>
        </section>

        {/* --- Items --- */}
        <section className="po-section" style={{ marginTop: "2rem" }}>
          <div className="section-header">
            <h2 className="section-title">Items</h2>
            <button
              type="button"
              onClick={() => setShowBulkPaste((v) => !v)}
              className="btn-outline"
            >
              <ClipboardPaste size={15} /> Paste Multiple
            </button>
          </div>

          {showBulkPaste && (
            <div className="po-create-bulk-paste">
              <div className="field-label" style={{ marginBottom: "0.4rem" }}>
                Paste rows as "No, Description, Weight" (tab, comma, or space separated)
              </div>
              <textarea
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                rows={5}
                className="input bulk-textarea"
              />
              <div className="modal-actions" style={{ paddingTop: "0.6rem" }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowBulkPaste(false);
                    setBulkText("");
                  }}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button type="button" onClick={handleBulkAdd} className="btn-primary">
                  Add Rows
                </button>
              </div>
            </div>
          )}

          <div className="form-row-3 po-create-item-form">
            <label style={{ display: "block" }}>
              <span className="field-label">No.</span>
              <input
                type="text"
                inputMode="numeric"
                value={itemForm.srNo}
                onChange={(e) => setItemForm({ ...itemForm, srNo: e.target.value })}
                className="input"
                style={{ marginTop: "0.25rem" }}
              />
            </label>
            <label style={{ display: "block" }}>
              <span className="field-label">Description</span>
              <input
                value={itemForm.description}
                onChange={(e) =>
                  setItemForm({ ...itemForm, description: e.target.value })
                }
                className="input"
                style={{ marginTop: "0.25rem" }}
              />
            </label>
            <div className="po-create-item-form-weight">
              <label style={{ display: "block", flex: 1 }}>
                <span className="field-label">Weight (kg)</span>
                <input
                  type="number"
                  step="0.01"
                  value={itemForm.weightKg}
                  onChange={(e) =>
                    setItemForm({ ...itemForm, weightKg: e.target.value })
                  }
                  className="input"
                  style={{ marginTop: "0.25rem" }}
                />
              </label>
              <button type="button" onClick={handleAddItem} className="btn-primary">
                <Plus size={15} /> Add
              </button>
            </div>
          </div>

          {items.length === 0 ? (
            <div className="empty-state" style={{ marginTop: "1rem" }}>
              No items added yet. Add them above, or paste multiple rows at once.
            </div>
          ) : (
            <div className="item-list" style={{ marginTop: "1rem", maxHeight: "20rem" }}>
              {items.map((it, i) => (
                <div key={i} className="item-list-row">
                  <div className="item-list-desc">
                    <span className="item-list-sr">{it.srNo}</span>
                    {it.description}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <span className="bulk-preview-weight tabular">
                      {fmtNum(it.weightKg, 2)} kg
                    </span>
                    <div className="row-actions">
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(i)}
                        className="delete-btn"
                        title="Remove item"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {error && <div className="field-error po-create-error">{error}</div>}

        <div className="modal-actions" style={{ marginTop: "1.5rem", paddingTop: 0 }}>
          <button type="button" onClick={() => navigate("/")} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? "Creating…" : "Create PO Sheet"}
          </button>
        </div>
      </form>
    </div>
  );
}