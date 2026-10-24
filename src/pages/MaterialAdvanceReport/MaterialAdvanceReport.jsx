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
import { fmtNum, fmtINR, fmtToday, drawPdfCompany } from "../../utils/format";
import * as XLSX from "xlsx";
import TitleBlock from "../../components/TitleBlock";
import Loading from "../../components/Loading";
import "./MaterialAdvanceReport.css";

// ---------------------------------------------------------------------------
// Exports (kept in this file so only one file needs to change)
// ---------------------------------------------------------------------------
const exportHeaders = (advLabel) => ["PO", advLabel, "Adjusted", "Bala. Mat. Adv."];

// Bala. Mat. Adv. = Material Advance (1st value column) - Adjusted (2nd).
const balaMatAdv = (r) => (r.recovered || 0) - (r.balanceAdvance || 0);

function stamp() {
  return new Date().toISOString().slice(0, 10);
}

// POs created with "NA" material advance show NA instead of numbers.
const matCell = (r, value) => (r.matAdvNA ? "NA" : fmtNum(value, 0));

function exportRow(r) {
  return [
    r.poCode,
    matCell(r, r.recovered),
    matCell(r, r.balanceAdvance),
    matCell(r, balaMatAdv(r)),
  ];
}

function exportTotal(t) {
  return [
    "Grand Total",
    fmtNum(t.recovered, 0),
    fmtNum(t.balanceAdvance, 0),
    fmtNum(balaMatAdv(t), 0),
  ];
}

function exportToExcel(totals, rows, advLabel) {
  const ws = XLSX.utils.aoa_to_sheet([
    exportHeaders(advLabel),
    ...rows.map(exportRow),
    exportTotal(totals),
  ]);
  ws["!cols"] = [{ wch: 16 }, { wch: 26 }, { wch: 16 }, { wch: 18 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Material Advance");
  XLSX.writeFile(wb, `Material-Advance-Report-${stamp()}.xlsx`);
}

async function exportToPDF(totals, rows, advLabel, company) {
  const { default: jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  drawPdfCompany(doc, company);
  doc.setFontSize(11);
  doc.setFont(undefined, "normal");
  doc.text("Material Advance Report", 40, 40);
  doc.setFontSize(9);
  doc.text(`POs: ${rows.length}`, 40, 58);
  autoTable(doc, {
    head: [exportHeaders(advLabel)],
    body: rows.map((r) => exportRow(r).map((v) => String(v))),
    foot: [exportTotal(totals)],
    startY: 72,
    margin: { left: 40, right: 40 },
    theme: "grid",
    styles: {
      fontSize: 8,
      cellPadding: 3,
      valign: "middle",
      lineColor: [0, 0, 0],
      lineWidth: 0.5,
      fillColor: false,
      textColor: 20,
    },
    headStyles: { fillColor: false, textColor: 20, fontStyle: "normal", lineWidth: 0.5 },
    footStyles: { fillColor: false, textColor: 20, fontStyle: "normal", lineWidth: 0.5 },
    alternateRowStyles: { fillColor: false },
    columnStyles: {
      1: { halign: "right" },
      2: { halign: "right" },
      3: { halign: "right" },
    },
  });
  doc.save(`Material-Advance-Report-${stamp()}.pdf`);
}

// Options for the "Group" dropdown. Keep in sync with the PO create page.
const PO_GROUPS = ["SIEC", "ST"];

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
    const filtered = allData.filter((d) => group === "all" || d.po.group === group);
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
    filtered.forEach(({ po, items, invoices }) => {
      const ledger = computePOLedger(po, items || [], invoices || []);
      adjustedById[po.id] = ledger.invoiceRows.reduce(
        (sum, inv) => sum + n(inv.matAdvance),
        0
      );
    });

    return {
      ...base,
      rows: base.rows.map((r) => {
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
        };
      }),
    };
  }, [allData, group]);

  const visibleRows = useMemo(() => {
    if (!report) return [];
    return filterMaterialAdvanceRows(report.rows, { search, status });
  }, [report, search, status]);

  // Column heading.
  const advLabel = "Material Advance";

  // Grand total follows the filters, so it always matches the rows on screen.
  const totals = useMemo(() => sumMaterialAdvanceRows(visibleRows), [visibleRows]);

  function handleExportExcel() {
    if (!report) return;
    exportToExcel(totals, visibleRows, advLabel);
  }

  async function handleExportPdf() {
    if (!report) return;
    setExportingPdf(true);
    try {
      await exportToPDF(totals, visibleRows, advLabel, group);
    } finally {
      setExportingPdf(false);
    }
  }

  function clearFilters() {
    setSearch("");
    setGroup("all");
    setStatus("all");
  }

  return (
    <div className="matadv-page">
      <div className="matadv-header">
        <TitleBlock
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
        <select value={group} onChange={(e) => setGroup(e.target.value)}>
          <option value="all">Group</option>
          {PO_GROUPS.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUS_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        {(search || group !== "all" || status !== "all") && (
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
                <th>PO</th>
                <th className="text-right">{advLabel}</th>
                <th className="text-right">Adjusted</th>
                <th className="text-right">Bala. Mat. Adv.</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((r) => (
                <tr
                  key={r.poId}
                  className="matadv-row"
                  onClick={() => navigate(`/po/${r.poId}`)}
                >
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
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Grand Total</td>
                <td className="text-right tabular">{fmtINR(totals.recovered)}</td>
                <td className="text-right tabular">{fmtINR(totals.balanceAdvance)}</td>
                <td className="text-right tabular">{fmtINR(balaMatAdv(totals))}</td>
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