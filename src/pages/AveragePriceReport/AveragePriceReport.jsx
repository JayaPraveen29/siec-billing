import { useEffect, useMemo, useState } from "react";
import { RefreshCw, FileSpreadsheet, FileText, Search } from "lucide-react";
import * as XLSX from "xlsx";
import { fetchAllPOData } from "../../services/poService";
import {
  computeAveragePriceReport,
  filterAveragePriceRows,
  sumAveragePriceRows,
  bucketRate,
} from "../../utils/averagePriceReport";
import { fyLabel, listFinancialYears } from "../../utils/financialYear";
import { PO_GROUPS, WORK_TYPES, matchesGroup, matchesWorkType } from "../../utils/groups";
import { fmtNum, fmtINR, fmtToday, companyName, drawPdfCompany } from "../../utils/format";
import GroupSelect, { WorkTypeSelect } from "../../components/GroupSelect";
import TitleBlock from "../../components/TitleBlock";
import Loading from "../../components/Loading";
import "./AveragePriceReport.css";

// ---------------------------------------------------------------------------
// Table layout shared by the screen and both exports.
//   PO No. | Weight | Rate | Basic
//   | SIEC / ST / Total  ->  STRL / CT / SCRAP  ->  MT / Rate / Value
// With a company selected only that company's block is shown.
// ---------------------------------------------------------------------------
const LEAD = ["PO No."];
const SUB = ["MT", "Rate", "Lacs"];

// A company selected -> only that company; no company -> only the overall Total.
const sectionsFor = (company) => (PO_GROUPS.includes(company) ? [company] : ["Total"]);

function cells(r, sections, empty = "", wts = WORK_TYPES) {
  const out = [r.section];
  sections.forEach((s) =>
    wts.forEach((w) => {
      const b = r.cells[s][w];
      out.push(b.mt > 0 ? fmtNum(b.mt) : empty, b.mt > 0 ? fmtNum(bucketRate(b) / 1000) : empty, b.mt > 0 ? fmtNum(b.value / 100000) : empty);
    })
  );
  return out;
}

// Three header rows: company / work type / MT-Rate-Value.
function exportHeadRows(sections) {
  const r1 = [...LEAD];
  const r2 = LEAD.map(() => "");
  const r3 = LEAD.map(() => "");
  sections.forEach((s) => {
    r1.push(s, ...Array(WORK_TYPES.length * 3 - 1).fill(""));
    WORK_TYPES.forEach((w) => {
      r2.push(w, "", "");
      r3.push(...SUB);
    });
  });
  return [r1, r2, r3];
}

function stamp() {
  return new Date().toISOString().slice(0, 10);
}

function exportToExcel(rows, total, company) {
  const sections = sectionsFor(company);
  const [h1, h2, h3] = exportHeadRows(sections);
  const ws = XLSX.utils.aoa_to_sheet([h1, h2, h3, ...rows.map((r) => cells(r, sections)), cells(total, sections)]);
  const merges = [];
  LEAD.forEach((_, c) => merges.push({ s: { r: 0, c }, e: { r: 2, c } }));
  const per = WORK_TYPES.length * 3;
  sections.forEach((_, i) => {
    const c0 = LEAD.length + i * per;
    merges.push({ s: { r: 0, c: c0 }, e: { r: 0, c: c0 + per - 1 } });
    WORK_TYPES.forEach((__, j) =>
      merges.push({ s: { r: 1, c: c0 + j * 3 }, e: { r: 1, c: c0 + j * 3 + 2 } })
    );
  });
  ws["!merges"] = merges;
  ws["!cols"] = [{ wch: 30 }, ...Array(h1.length - 1).fill({ wch: 14 })];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Average Price");
  XLSX.writeFile(wb, `Average-Price-Report-${stamp()}.xlsx`);
}

async function exportToPDF(allRows, total, company, fy) {
  const sections = sectionsFor(company);
  // Leave out what is empty: work types with no figures in the shown block(s),
  // and POs that have nothing in any shown column.
  const wts = WORK_TYPES.filter((w) => sections.some((s) => total.cells[s][w].mt > 0));
  const rows = allRows.filter((r) => sections.some((s) => wts.some((w) => r.cells[s][w].mt > 0)));
  const { default: jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  drawPdfCompany(doc, company);
  doc.setFontSize(11);
  doc.setFont(undefined, "normal");
  doc.text(`Average Price Report${fy !== "all" ? ` - FY ${fyLabel(Number(fy))}` : ""}`, 40, 40);
  doc.setFontSize(9);
  doc.text(`POs: ${rows.length}`, 40, 58);

  const head = [
    [
      ...LEAD.map((h) => ({ content: h, rowSpan: 3, styles: { valign: "middle" } })),
      ...sections.map((s) => ({ content: s, colSpan: wts.length * 3, styles: { halign: "center" } })),
    ],
    sections.flatMap(() => wts.map((w) => ({ content: w, colSpan: 3, styles: { halign: "center" } }))),
    sections.flatMap(() => wts.flatMap(() => SUB)),
  ];
  autoTable(doc, {
    head,
    body: rows.map((r) => cells(r, sections, "", wts).map(String)),
    foot: [cells(total, sections, "", wts).map(String)],
    startY: 72,
    margin: { left: 24, right: 24 },
    tableWidth: "wrap", // columns shrink to their content
    theme: "grid",
    styles: {
      fontSize: 6.5,
      cellPadding: { top: 2, bottom: 2, left: 3, right: 3 },
      valign: "middle",
      lineColor: [0, 0, 0],
      lineWidth: 0.5,
      fillColor: false,
      textColor: 20,
    },
    headStyles: { fillColor: false, textColor: 20, fontStyle: "normal", lineWidth: 0.5 },
    footStyles: { fillColor: false, textColor: 20, fontStyle: "bold", lineWidth: 0.5 },
    alternateRowStyles: { fillColor: false },
    columnStyles: Object.fromEntries(
      Array.from({ length: LEAD.length + sections.length * wts.length * 3 - 1 }, (_, i) => [
        i + 1,
        { halign: "right" },
      ])
    ),
  });
  doc.save(`Average-Price-Report-${stamp()}.pdf`);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function AveragePriceReport() {
  const [allData, setAllData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exportingPdf, setExportingPdf] = useState(false);

  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("all");
  const [workType, setWorkType] = useState("all");
  const [fy, setFy] = useState("all");

  async function load() {
    setLoading(true);
    const all = await fetchAllPOData();
    setAllData(all);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const fyOptions = useMemo(() => listFinancialYears(allData), [allData]);

  const report = useMemo(() => {
    if (!allData) return null;
    return computeAveragePriceReport(
      allData.filter(
        (d) => matchesGroup(d.po.group, group) && matchesWorkType(d.po.workType, workType)
      ),
      { fy }
    );
  }, [allData, group, workType, fy]);

  const sections = sectionsFor(group);

  const visibleRows = useMemo(
    () => (report ? filterAveragePriceRows(report.rows, { search }) : []),
    [report, search]
  );

  // Grand total follows the filters, so it always matches the rows on screen.
  const total = useMemo(() => sumAveragePriceRows(visibleRows), [visibleRows]);

  async function handleExportPdf() {
    if (!report) return;
    setExportingPdf(true);
    try {
      await exportToPDF(visibleRows, total, group, fy);
    } finally {
      setExportingPdf(false);
    }
  }

  function clearFilters() {
    setSearch("");
    setGroup("all");
    setWorkType("all");
    setFy("all");
  }

  return (
    <div className="avgp-page">
      <div className="avgp-header">
        <TitleBlock
          company={companyName(group)}
          docType={`AVERAGE PRICE REPORT${fy !== "all" ? ` · FY ${fyLabel(Number(fy))}` : ""}`}
          fields={[
            { label: "POs", value: report ? visibleRows.length : "—" },
            { label: "Generated", value: fmtToday() },
          ]}
        />
        <div className="avgp-actions">
          <button
            onClick={() => exportToExcel(visibleRows, total, group)}
            className="avgp-export-btn"
            disabled={!report || loading}
            title="Export to Excel"
          >
            <FileSpreadsheet size={15} />
            Excel
          </button>
          <button
            onClick={handleExportPdf}
            className="avgp-export-btn"
            disabled={!report || loading || exportingPdf}
            title="Export to PDF"
          >
            <FileText size={15} className={exportingPdf ? "spinning" : ""} />
            PDF
          </button>
          <button onClick={load} className="avgp-refresh">
            <RefreshCw size={15} className={loading ? "spinning" : ""} />
            Refresh
          </button>
        </div>
      </div>

      <div className="avgp-controls">
        <div className="avgp-search">
          <Search size={15} className="text-muted" />
          <input
            type="text"
            placeholder="Search PO…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <GroupSelect value={group} onChange={setGroup} />
        <WorkTypeSelect value={workType} onChange={setWorkType} />
        <select value={fy} onChange={(e) => setFy(e.target.value)}>
          <option value="all">Financial Year</option>
          {fyOptions.map((y) => (
            <option key={y} value={y}>
              FY {fyLabel(y)}
            </option>
          ))}
        </select>
        {(search || group !== "all" || workType !== "all" || fy !== "all") && (
          <button type="button" className="avgp-clear" onClick={clearFilters}>
            Clear filters
          </button>
        )}
      </div>

      {loading && <Loading label="Compiling report" />}

      {!loading && report && visibleRows.length > 0 && (
        <div className="table-scroll avgp-table-wrap">
          <table className="ledger-table avgp-table">
            <thead>
              <tr>
                <th rowSpan={3}>PO No.</th>
                {sections.map((s) => (
                  <th key={s} colSpan={WORK_TYPES.length * 3} className="avgp-group">
                    {s}
                  </th>
                ))}
              </tr>
              <tr>
                {sections.flatMap((s) =>
                  WORK_TYPES.map((w) => (
                    <th key={`${s}-${w}`} colSpan={3} className="avgp-group avgp-sep">
                      {w}
                    </th>
                  ))
                )}
              </tr>
              <tr>
                {sections.flatMap((s) =>
                  WORK_TYPES.flatMap((w) =>
                    SUB.map((h, i) => (
                      <th key={`${s}-${w}-${h}`} className={`text-right${i === 0 ? " avgp-sep" : ""}`}>
                        {h}
                      </th>
                    ))
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((r) => (
                <tr key={r.poId || r.section}>
                  <td className="text-rivet">{r.section}</td>
                  {sections.flatMap((s) =>
                    WORK_TYPES.map((w) => <CellTriple key={`${s}-${w}`} b={r.cells[s][w]} />)
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Grand Total</td>
                {sections.flatMap((s) =>
                  WORK_TYPES.map((w) => <CellTriple key={`${s}-${w}`} b={total.cells[s][w]} />)
                )}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {!loading && report && visibleRows.length === 0 && (
        <div className="empty-state" style={{ marginTop: "1.5rem" }}>
          {report.rows.length === 0
            ? "No PO items to report on yet."
            : "No POs match your filters."}
        </div>
      )}
    </div>
  );
}

// MT / Rate / Value cells for one work type under one company block.
function CellTriple({ b }) {
  const has = b.mt > 0;
  return (
    <>
      <td className="text-right tabular avgp-sep">{has ? fmtNum(b.mt) : ""}</td>
      <td className="text-right tabular">{has ? fmtNum(bucketRate(b) / 1000) : ""}</td>
      <td className="text-right tabular">{has ? fmtNum(b.value / 100000) : ""}</td>
    </>
  );
}