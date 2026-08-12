import { useState } from "react";
import { readWorkbook, listDataSheetNames, parsePOSheet } from "../../utils/excelImport";
import { fmtNum } from "../../utils/format";

/**
 * Modal: upload an .xlsx built in the "127-57452" style template, preview
 * what will be imported, then hand the parsed result to onImport().
 *
 * onImport(parsed) should:
 *   1. optionally call updatePOSheet(poId, { unitRate, gstPercent, tdsPercent,
 *      matAdvPercent, openingMatAdvance }) if the user wants those overwritten
 *   2. call addItemsBulk(poId, parsed.items) — needs to resolve with the created
 *      item docs (including their ids) so allocations can be mapped by srNo
 *   3. for each entry in parsed.invoices, map allocationsByItemSrNo -> { itemId: qty }
 *      using the ids from step 2, then call addInvoice(poId, { invoiceNo, invoiceDate,
 *      allocations, paymentReceived })
 *
 * This component only handles parsing + preview; the actual writes stay in
 * POSheet.jsx so it can reuse the same addItemsBulk/addInvoice calls already
 * wired to your data layer.
 */
export default function ImportPOModal({ onCancel, onImport }) {
  const [workbook, setWorkbook] = useState(null);
  const [sheetNames, setSheetNames] = useState([]);
  const [selectedSheet, setSelectedSheet] = useState("");
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const [overwriteHeader, setOverwriteHeader] = useState(true);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setParsed(null);
    try {
      const wb = await readWorkbook(file);
      const names = listDataSheetNames(wb);
      setWorkbook(wb);
      setSheetNames(names);
      const first = names[0] || "";
      setSelectedSheet(first);
      if (first) tryParse(wb, first);
    } catch (err) {
      setError(`Could not read file: ${err.message}`);
    }
  }

  function tryParse(wb, sheetName) {
    try {
      const result = parsePOSheet(wb, sheetName);
      setParsed(result);
      setError("");
    } catch (err) {
      setParsed(null);
      setError(err.message);
    }
  }

  function handleSheetChange(name) {
    setSelectedSheet(name);
    if (workbook) tryParse(workbook, name);
  }

  async function handleConfirm() {
    if (!parsed) return;
    setImporting(true);
    try {
      await onImport({ ...parsed, overwriteHeader });
    } catch (err) {
      setError(`Import failed: ${err.message}`);
    } finally {
      setImporting(false);
    }
  }

  const totalWeight = parsed?.items.reduce((s, i) => s + i.weightKg, 0) ?? 0;
  const invoicesWithLines = parsed?.invoices.filter(
    (inv) => Object.keys(inv.allocationsByItemSrNo).length > 0
  ) ?? [];

  return (
    <div className="modal-overlay">
      <div className="modal-panel" style={{ maxWidth: "34rem" }}>
        <h3 className="modal-title">Import PO Sheet from Excel</h3>

        <label style={{ display: "block" }}>
          <span className="field-label">Excel file (.xlsx)</span>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFile}
            className="input"
            style={{ marginTop: "0.25rem" }}
          />
        </label>

        {sheetNames.length > 1 && (
          <label style={{ display: "block", marginTop: "0.75rem" }}>
            <span className="field-label">Sheet</span>
            <select
              value={selectedSheet}
              onChange={(e) => handleSheetChange(e.target.value)}
              className="input"
              style={{ marginTop: "0.25rem" }}
            >
              {sheetNames.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}

        {error && (
          <p className="field-error" style={{ marginTop: "0.75rem" }}>
            {error}
          </p>
        )}

        {parsed && !error && (
          <div style={{ marginTop: "1rem" }}>
            <div className="bulk-summary">
              <span className="bulk-summary-ok">
                {parsed.items.length} items · {fmtNum(totalWeight, 1)} kg total
              </span>
              <span className="bulk-summary-ok">
                {invoicesWithLines.length} of {parsed.invoices.length} invoice columns have quantities
              </span>
            </div>

            <div className="item-list bulk-preview" style={{ maxHeight: "10rem" }}>
              {parsed.items.map((it) => (
                <div key={it.srNo} className="item-list-row">
                  <div className="item-list-desc">
                    <span className="item-list-sr">{it.srNo}</span>
                    {it.description}
                  </div>
                  <span className="bulk-preview-weight tabular">{fmtNum(it.weightKg, 2)} kg</span>
                </div>
              ))}
            </div>

            <div style={{ marginTop: "0.75rem", fontSize: "0.85rem" }} className="text-muted">
              Detected header values — Unit Rate ₹{fmtNum(parsed.unitRate, 2)}, GST {parsed.gstPercent}%,
              TDS {parsed.tdsPercent}%, Material Advance {parsed.matAdvPercent}%, Opening Mat. Advance{" "}
              ₹{fmtNum(parsed.openingMatAdvance, 0)}
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.5rem" }}>
              <input
                type="checkbox"
                checked={overwriteHeader}
                onChange={(e) => setOverwriteHeader(e.target.checked)}
              />
              <span style={{ fontSize: "0.85rem" }}>
                Overwrite this PO's rate/GST/TDS/Mat. Advance settings with the detected values
              </span>
            </label>
          </div>
        )}

        <div className="modal-actions">
          <button type="button" onClick={onCancel} className="btn-secondary">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!parsed || !!error || importing}
            className="btn-primary"
          >
            {importing ? "Importing…" : "Import"}
          </button>
        </div>
      </div>
    </div>
  );
}