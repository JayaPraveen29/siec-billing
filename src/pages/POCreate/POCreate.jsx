import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Trash2, ClipboardPaste } from "lucide-react";
import { createPOSheet, addItemsBulk } from "../../services/poService";
import { parseBulkItemsText } from "../PO/POSheet";
import { fmtNum } from "../../utils/format";
import { PO_GROUPS, WORK_TYPES } from "../../utils/groups";
import TitleBlock from "../../components/TitleBlock";
import "./POCreate.css";


// Accepts typed text such as "1,00,000", "₹ 5000" or "20%" and returns the number.
function parseLooseNumber(v) {
  const n = parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

const emptyForm = {
  poNumber: "",
  group: "",
  workType: "",
  projectManager: "",
  unitRate: "",
  gstPercent: "18",
  tdsPercent: "0.1",
  matAdvPercent: "20",
  openingMatAdvance: "",
};

const emptyItemForm = { srNo: "", description: "", weightKg: "", numbers: "", area: "" };

// Coal Tube (CT) POs: description is fixed, "Numbers" is entered manually and
// weight is calculated automatically (numbers x weight of one tube).
const CT_DESCRIPTION = "Coal Tube";
const CT_TUBE_WEIGHT_KG = 586;

export default function POCreate() {
  const navigate = useNavigate();

  const [form, setForm] = useState(emptyForm);
  const [items, setItems] = useState([]); // [{srNo, description, weightKg}]
  const [itemForm, setItemForm] = useState(emptyItemForm);

  const [showBulkPaste, setShowBulkPaste] = useState(false);
  const [bulkText, setBulkText] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isCT = form.workType === "CT";
  const ctNumbers = Number(itemForm.numbers);
  const ctWeight =
    Number.isFinite(ctNumbers) && ctNumbers > 0
      ? Math.round(ctNumbers * CT_TUBE_WEIGHT_KG * 100) / 100
      : 0;

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
    const srNo = itemForm.srNo === "" ? nextSrNo() : Number(itemForm.srNo) || 0;
    if (isCT) {
      if (ctWeight <= 0) return;
      setItems((prev) => [
        ...prev,
        {
          srNo,
          description: CT_DESCRIPTION,
          area: itemForm.area.trim(),
          numbers: ctNumbers,
          weightKg: ctWeight,
        },
      ]);
    } else {
      const description = itemForm.description.trim();
      const weightKg = Number(itemForm.weightKg);
      if (!description || !Number.isFinite(weightKg) || weightKg <= 0) return;
      setItems((prev) => [...prev, { srNo, description, weightKg }]);
    }
    setItemForm(emptyItemForm);
  }

  function handleWorkTypeChange(value) {
    const switchingCT = (value === "CT") !== (form.workType === "CT");
    if (switchingCT && items.length > 0) {
      const ok = window.confirm(
        "Changing to/from CT changes the item format. Items added so far will be cleared. Continue?"
      );
      if (!ok) return;
      setItems([]);
    }
    setItemForm(emptyItemForm);
    setShowBulkPaste(false);
    setBulkText("");
    setForm({ ...form, workType: value });
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
    if (!form.group) {
      setError("Please select a Group.");
      return;
    }
    if (!form.workType) {
      setError("Please select a Work Type.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const ref = await createPOSheet({
        code: form.poNumber.trim(),
        poNumber: form.poNumber.trim(),
        group: form.group,
        workType: form.workType,
        projectManager: form.projectManager.trim(),
        unitRate: Number(form.unitRate) || 0,
        gstPercent: Number(form.gstPercent) || 0,
        tdsPercent: Number(form.tdsPercent) || 0,
        matAdvPercent: parseLooseNumber(form.matAdvPercent),
        openingMatAdvance: parseLooseNumber(form.openingMatAdvance),
      });

      if (items.length > 0) {
        await addItemsBulk(
          ref.id,
          items.map(({ srNo, description, weightKg, numbers, area }) => ({
            srNo: Number(srNo) || 0,
            description,
            weightKg: Number(weightKg) || 0,
            ...(numbers != null
              ? { numbers: Number(numbers) || 0, area: String(area ?? "").trim() }
              : {}),
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

          <div className="form-row-3">
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
            <label style={{ display: "block" }}>
              <span className="field-label">Group</span>
              <select
                required
                value={form.group}
                onChange={(e) => setForm({ ...form, group: e.target.value })}
                className="input"
                style={{ marginTop: "0.25rem" }}
              >
                <option value="">Select group</option>
                {PO_GROUPS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "block" }}>
              <span className="field-label">Work Type</span>
              <select
                required
                value={form.workType}
                onChange={(e) => handleWorkTypeChange(e.target.value)}
                className="input"
                style={{ marginTop: "0.25rem" }}
              >
                <option value="">Select work type</option>
                {WORK_TYPES.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="form-row-2" style={{ marginTop: "0.75rem" }}>
            <label style={{ display: "block" }}>
              <span className="field-label">Project Manager</span>
              <input
                value={form.projectManager}
                onChange={(e) => setForm({ ...form, projectManager: e.target.value })}
                className="input"
                style={{ marginTop: "0.25rem" }}
              />
            </label>
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
          </div>

          <div className="form-row-2" style={{ marginTop: "0.75rem" }}>
            <label style={{ display: "block" }}>
              <span className="field-label">Opening Mat. Advance (₹)</span>
              <input
                type="text"
                inputMode="decimal"
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
                type="text"
                inputMode="decimal"
                placeholder="e.g. 20 or 20%"
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
            {!isCT && (
              <button
                type="button"
                onClick={() => setShowBulkPaste((v) => !v)}
                className="btn-outline"
              >
                <ClipboardPaste size={15} /> Paste Multiple
              </button>
            )}
          </div>

          {showBulkPaste && !isCT && (
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
            {!isCT && (
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
            )}
            {isCT ? (
              <>
                <label style={{ display: "block" }}>
                  <span className="field-label">Description</span>
                  <input
                    value={CT_DESCRIPTION}
                    readOnly
                    className="input"
                    style={{ marginTop: "0.25rem" }}
                  />
                </label>
                <label style={{ display: "block" }}>
                  <span className="field-label">Area</span>
                  <input
                    type="text"
                    value={itemForm.area}
                    onChange={(e) => setItemForm({ ...itemForm, area: e.target.value })}
                    className="input"
                    style={{ marginTop: "0.25rem" }}
                  />
                </label>
                <div className="po-create-item-form-weight">
                  <label style={{ display: "block", flex: 1 }}>
                    <span className="field-label">Numbers (Nos.)</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={itemForm.numbers}
                      onChange={(e) =>
                        setItemForm({ ...itemForm, numbers: e.target.value })
                      }
                      className="input"
                      style={{ marginTop: "0.25rem" }}
                    />
                  </label>
                  <label style={{ display: "block", flex: 1 }}>
                    <span className="field-label">
                      Weight (kg) @ {CT_TUBE_WEIGHT_KG}/tube
                    </span>
                    <input
                      readOnly
                      value={ctWeight ? fmtNum(ctWeight, 2) : ""}
                      className="input"
                      style={{ marginTop: "0.25rem" }}
                    />
                  </label>
                  <button type="button" onClick={handleAddItem} className="btn-primary">
                    <Plus size={15} /> Add
                  </button>
                </div>
              </>
            ) : (
              <>
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
              </>
            )}
          </div>

          {items.length === 0 ? (
            <div className="empty-state" style={{ marginTop: "1rem" }}>
              {isCT
                ? "No items added yet. Enter the number of tubes above."
                : "No items added yet. Add them above, or paste multiple rows at once."}
            </div>
          ) : (
            <div className="item-list" style={{ marginTop: "1rem", maxHeight: "20rem" }}>
              {items.map((it, i) => (
                <div key={i} className="item-list-row">
                  <div className="item-list-desc">
                    <span className="item-list-sr">{it.srNo}</span>
                    {it.description}
                    {it.numbers != null && (
                      <span className="bulk-preview-weight tabular">
                        {" "}• Area {it.area} • {it.numbers} nos
                      </span>
                    )}
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