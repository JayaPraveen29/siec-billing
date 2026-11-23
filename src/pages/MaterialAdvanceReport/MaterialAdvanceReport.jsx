import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { RefreshCw, FileSpreadsheet, FileText, Search } from "lucide-react";
import { fetchAllPOData } from "../../services/poService";
import {
  computeMaterialAdvanceReport,
  filterMaterialAdvanceRows,
  sumMaterialAdvanceRows,
} from "../../utils/materialAdvanceReport";
import { computePOLedger, isMatAdvNA } from "../../utils/ledger";
import { fmtToday, drawPdfCompany } from "../../utils/format";
import * as XLSX from "xlsx";
import GroupSelect, { WorkTypeSelect } from "../../components/GroupSelect";
import { matchesGroup, matchesWorkType } from "../../utils/groups";
import { companyName } from "../../utils/format";
import TitleBlock from "../../components/TitleBlock";
import Loading from "../../components/Loading";
import "./MaterialAdvanceReport.css";


// Whole rupees only - no decimals anywhere on this report.
const fmt0 = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return "-";
  return Math.round(v).toLocaleString("en-IN", { maximumFractionDigits: 0 });
};
const fmtINR0 = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return "-";
  return (Math.round(v) < 0 ? "-" : "") + "\u20B9" + fmt0(Math.abs(v));
};

const exportHeaders = (advLabel) => ["S.No.", "PO", advLabel, "Adjusted", "Bala. Mat. Adv."];

// Bala. Mat. Adv. = Material Advance (1st value column) - Adjusted (2nd).
const balaMatAdv = (r) => (r.recovered || 0) - (r.balanceAdvance || 0);

function stamp() {
  return new Date().toISOString().slice(0, 10);
}

// POs created with "NA" material advance show NA instead of numbers.
const matCell = (r, value) => (r.matAdvNA ? "NA" : fmt0(value));

// Unit order on the report: SIEC first, then ST, then anything else.
const UNIT_ORDER = ["SIEC", "ST"];
const unitLabel = (g) => (g ? String(g) : "OTHER");

/**
 * Turns the flat PO rows into display items: a unit heading ("SIEC", "ST")
 * printed ONCE per unit, followed by that unit's POs. Serial numbers restart
 * from 1 inside every unit. Rows keep their existing order within a unit.
 */
function buildDisplayItems(rows) {
  const buckets = new Map();
  rows.forEach((r) => {
    const key = unitLabel(r.group);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(r);
  });
  const keys = [...buckets.keys()].sort((a, b) => {
    const ia = UNIT_ORDER.indexOf(a);
    const ib = UNIT_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
  });
  const items = [];
  keys.forEach((k) => {
    items.push({ type: "unit", name: k });
    buckets.get(k).forEach((r, i) => items.push({ type: "row", sn: i + 1, row: r }));
    items.push({ type: "subtotal", name: k, totals: sumMaterialAdvanceRows(buckets.get(k)) });
  });
  return items;
}

function exportRow(sn, r) {
  return [
    sn,
    r.poCode,
    matCell(r, r.recovered),
    matCell(r, r.balanceAdvance),
    matCell(r, balaMatAdv(r)),
  ];
}

function exportTotal(t, label = "Grand Total") {
  return [
    "",
    label,
    fmt0(t.recovered),
    fmt0(t.balanceAdvance),
    fmt0(balaMatAdv(t)),
  ];
}

// SheetJS (community) cannot write page setup, so patch the sheet XML to make
// the printout A4 portrait, fitted to one page wide.
async function makePortrait(wb) {
  const { default: JSZip } = await import("jszip");
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const zip = await JSZip.loadAsync(buf);
  const path = "xl/worksheets/sheet1.xml";
  let xml = await zip.file(path).async("string");
  xml = xml
    .replace(/<worksheet([^>]*)>/, '<worksheet$1><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>')
    .replace(
      /(<pageMargins[^>]*\/>)/,
      '$1<pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="0"/>'
    );
  zip.file(path, xml);
  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

async function exportToExcel(totals, items, rowCount, advLabel) {
  const aoa = [exportHeaders(advLabel)];
  const unitRows = [];
  items.forEach((it) => {
    if (it.type === "unit") {
      unitRows.push(aoa.length);
      aoa.push([it.name, "", "", "", ""]);
    } else if (it.type === "subtotal") {
      aoa.push(exportTotal(it.totals, `${it.name} Total`));
    } else {
      aoa.push(exportRow(it.sn, it.row));
    }
  });
  aoa.push(exportTotal(totals));

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 7 }, { wch: 16 }, { wch: 22 }, { wch: 14 }, { wch: 16 }];
  // Unit heading spans the whole row.
  ws["!merges"] = unitRows.map((r) => ({ s: { r, c: 0 }, e: { r, c: 4 } }));
  ws["!margins"] = { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Material Advance");

  const blob = await makePortrait(wb);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `Material-Advance-Report-${stamp()}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function exportToPDF(totals, items, rowCount, advLabel, company) {
  const { default: jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  drawPdfCompany(doc, company);
  doc.setFontSize(11);
  doc.setFont(undefined, "normal");
  doc.text("Material Advance Report", 40, 40);
  doc.setFontSize(9);
  doc.text(`POs: ${rowCount}`, 40, 58);

  const body = items.map((it) => {
    if (it.type === "unit")
      return [{ content: it.name, colSpan: 5, styles: { fontStyle: "bold", halign: "left" } }];
    if (it.type === "subtotal")
      return exportTotal(it.totals, `${it.name} Total`).map((v, i) => ({
        content: String(v),
        styles: { fontStyle: "bold", halign: i >= 2 ? "right" : "left" },
      }));
    return exportRow(it.sn, it.row).map((v) => String(v));
  });

  autoTable(doc, {
    head: [exportHeaders(advLabel)],
    body,
    foot: [exportTotal(totals)],
    startY: 72,
    margin: { left: 40, right: 40 },
    tableWidth: "wrap",
    theme: "grid",
    styles: {
      fontSize: 8,
      cellPadding: 3,
      valign: "middle",
      cellWidth: "wrap",
      overflow: "visible",
      lineColor: [0, 0, 0],
      lineWidth: 0.5,
      fillColor: false,
      textColor: 20,
    },
    headStyles: { fillColor: false, textColor: 20, fontStyle: "normal", lineWidth: 0.5 },
    footStyles: { fillColor: false, textColor: 20, fontStyle: "normal", lineWidth: 0.5 },
    alternateRowStyles: { fillColor: false },
    columnStyles: {
      0: { halign: "center" },
      1: { halign: "left" },
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
    },
  });
  doc.save(`Material-Advance-Report-${stamp()}.pdf`);
}


const STATUS_FILTERS = [
  { value: "all", label: "All Advance Status" },
  { value: "balance-pending", label: "Balance Pending" },
  { value: "fully-recovered", label: "Fully Recovered" },
  { value: "over-recovered", label: "Over Recovered" },
  { value: "no-advance", label: "No Advance" },
];

export default function MaterialAdvanceReport() {
  const navigate = useNavigate();
  const [allData, setAllData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exportingPdf, setExportingPdf] = useState(false);

  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("all");
  const [workType, setWorkType] = useState("all");
  const [status, setStatus] = useState("all");

  async function load() {
    setLoading(true);
    const all = await fetchAllPOData();
    setAllData(all);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const report = useMemo(() => {
    if (!allData) return null;
    const filtered = allData.filter((d) => matchesGroup(d.po.group, group) && matchesWorkType(d.po.workType, workType));
    const base = computeMaterialAdvanceReport(filtered);

    // "Material Advance @ x%" column = the PO-level figure shown under the
    // "Wt./Kg" column on the PO sheet page. It is entered manually there
    // (double-click) and stored as the PO's openingMatAdvance - never
    // calculated, and never the amount deducted through any one invoice.
    const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
    const poLevelById = {};
    const naById = {};
    filtered.forEach(({ po }) => {
      poLevelById[po.id] = n(po.openingMatAdvance);
      naById[po.id] = isMatAdvNA(po);
    });

    // "Adjusted" column = the material advance actually adjusted (deducted)
    // through the PO's invoices, i.e. the sum of the per-invoice "Material
    // Advance" deductions. (Previously this summed the running balances of
    // every invoice, which over-counted.)
    const adjustedById = {};
    // PO progress, same rule as the ABS report:
    //   0 = completed   (invoices raised for the full PO qty and all paid)
    //   1 = in progress (some invoicing / payment activity, not complete)
    //   2 = not started (no invoices raised yet)
    const stageById = {};
    filtered.forEach(({ po, items, invoices }) => {
      const ledger = computePOLedger(po, items || [], invoices || []);
      adjustedById[po.id] = ledger.invoiceRows.reduce(
        (sum, inv) => sum + n(inv.matAdvance),
        0
      );
      let stage = 1;
      if (ledger.invoiceRows.length === 0) {
        stage = 2;
      } else if (
        Math.abs(ledger.totals.balanceQty) < 0.001 &&
        ledger.invoiceRows.every((r) => !r.isUnpaid)
      ) {
        stage = 0;
      }
      stageById[po.id] = stage;
    });

    const rows = base.rows.map((r) => {
      const advance = poLevelById[r.poId] || 0;
      const adjusted = adjustedById[r.poId] || 0;
      const bala = advance - adjusted;
      // Status follows the figures shown on this report.
      const status =
        advance <= 1 && adjusted <= 1
          ? "no-advance"
          : bala < -1
          ? "over-recovered"
          : bala <= 1
          ? "fully-recovered"
          : "balance-pending";
      return {
        ...r,
        recovered: advance,
        balanceAdvance: adjusted,
        status,
        matAdvNA: !!naById[r.poId],
        stage: stageById[r.poId] ?? 1,
      };
    });

    // POs with material advance "NA" always go at the end of the table. The
    // rest: completed first, then in-progress, then not started. Array.sort is
    // stable, so POs keep their PO-code order inside each block.
    rows.sort(
      (a, b) => Number(a.matAdvNA) - Number(b.matAdvNA) || a.stage - b.stage
    );

    return { ...base, rows };
  }, [allData, group, workType]);

  const visibleRows = useMemo(() => {
    if (!report) return [];
    return filterMaterialAdvanceRows(report.rows, { search, status });
  }, [report, search, status]);

  // Rows grouped under a unit heading (SIEC once, then ST once).
  const displayItems = useMemo(() => buildDisplayItems(visibleRows), [visibleRows]);

  // Column heading.
  const advLabel = "Material Advance";

  // Grand total follows the filters, so it always matches the rows on screen.
  const totals = useMemo(() => sumMaterialAdvanceRows(visibleRows), [visibleRows]);

  function handleExportExcel() {
    if (!report) return;
    exportToExcel(totals, displayItems, visibleRows.length, advLabel);
  }

  async function handleExportPdf() {
    if (!report) return;
    setExportingPdf(true);
    try {
      await exportToPDF(totals, displayItems, visibleRows.length, advLabel, group);
    } finally {
      setExportingPdf(false);
    }
  }

  function clearFilters() {
    setSearch("");
    setGroup("all");
    setWorkType("all");
    setStatus("all");
  }

  return (
    <div className="matadv-page">
      <div className="matadv-header">
        <TitleBlock
          company={companyName(group)}
          docType="MATERIAL ADVANCE REPORT"
          fields={[
            { label: "POs", value: report ? report.rows.length : "—" },
            { label: "Generated", value: fmtToday() },
          ]}
        />
        <div className="matadv-actions">
          <button
            onClick={handleExportExcel}
            className="matadv-export-btn"
            disabled={!report || loading}
            title="Export to Excel"
          >
            <FileSpreadsheet size={15} />
            Excel
          </button>
          <button
            onClick={handleExportPdf}
            className="matadv-export-btn"
            disabled={!report || loading || exportingPdf}
            title="Export to PDF"
          >
            <FileText size={15} className={exportingPdf ? "spinning" : ""} />
            PDF
          </button>
          <button onClick={load} className="matadv-refresh">
            <RefreshCw size={15} className={loading ? "spinning" : ""} />
            Refresh
          </button>
        </div>
      </div>

      <div className="matadv-controls">
        <div className="matadv-search">
          <Search size={15} className="text-muted" />
          <input
            type="text"
            placeholder="Search PO code or number…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <GroupSelect value={group} onChange={setGroup} />
<WorkTypeSelect value={workType} onChange={setWorkType} />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUS_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        {(search || group !== "all" || workType !== "all" || status !== "all") && (
          <button type="button" className="matadv-clear" onClick={clearFilters}>
            Clear filters
          </button>
        )}
      </div>

      {loading && <Loading label="Compiling report" />}

      {!loading && report && (
        <div className="table-scroll matadv-table-wrap">
          <table className="ledger-table">
            <thead>
              <tr>
                <th style={{ width: "3.5rem" }}>S.No.</th>
                <th>PO</th>
                <th className="text-right">{advLabel}</th>
                <th className="text-right">Adjusted</th>
                <th className="text-right">Bala. Mat. Adv.</th>
              </tr>
            </thead>
            <tbody>
              {displayItems.map((it) =>
                it.type === "unit" ? (
                  <tr key={`unit-${it.name}`} className="matadv-unit-row">
                    <td colSpan={5} style={{ fontWeight: 700 }}>
                      {it.name}
                    </td>
                  </tr>
                ) : it.type === "subtotal" ? (
                  <tr key={`sub-${it.name}`} className="matadv-unit-row">
                    <td></td>
                    <td style={{ fontWeight: 700 }}>{it.name} Total</td>
                    <td className="text-right tabular" style={{ fontWeight: 700 }}>{fmtINR0(it.totals.recovered)}</td>
                    <td className="text-right tabular" style={{ fontWeight: 700 }}>{fmtINR0(it.totals.balanceAdvance)}</td>
                    <td className="text-right tabular" style={{ fontWeight: 700 }}>{fmtINR0(balaMatAdv(it.totals))}</td>
                  </tr>
                ) : (
                  (() => {
                    const r = it.row;
                    return (
                <tr
                  key={r.poId}
                  className="matadv-row"
                  onClick={() => navigate(`/po/${r.poId}`)}
                >
                  <td className="tabular">{it.sn}</td>
                  <td className="text-rivet">{r.poCode}</td>
                  <td className="text-right tabular">{matCell(r, r.recovered)}</td>
                  <td className="text-right tabular" style={{ fontWeight: 600 }}>
                    {matCell(r, r.balanceAdvance)}
                  </td>
                  <td
                    className={`text-right tabular ${
                      balaMatAdv(r) < -0.5 ? "text-warn" : ""
                    }`}
                    style={{ fontWeight: 600 }}
                  >
                    {matCell(r, balaMatAdv(r))}
                  </td>
                </tr>
                    );
                  })()
                )
              )}
            </tbody>
            <tfoot>
              <tr>
                <td></td>
                <td>Grand Total</td>
                <td className="text-right tabular">{fmtINR0(totals.recovered)}</td>
                <td className="text-right tabular">{fmtINR0(totals.balanceAdvance)}</td>
                <td className="text-right tabular">{fmtINR0(balaMatAdv(totals))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {!loading && report && visibleRows.length === 0 && (
        <div className="empty-state" style={{ marginTop: "1.5rem" }}>
          {report.rows.length === 0
            ? "No PO sheets to report on yet."
            : "No POs match your filters."}
        </div>
      )}
    </div>
  );
}