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
import { PO_GROUPS, matchesGroup, matchesWorkType } from "../../utils/groups";
import { fmtNum, fmtINR, fmtToday, companyName, drawPdfCompany } from "../../utils/format";
import GroupSelect, { WorkTypeSelect } from "../../components/GroupSelect";
import TitleBlock from "../../components/TitleBlock";
import Loading from "../../components/Loading";
import "./AveragePriceReport.css";

// ---------------------------------------------------------------------------
// Table layout shared by the screen and both exports.
//   Section | Weight | Rate | Basic | SIEC (MT, Inv. Value, Rate/MT)
//   | ST (MT, Inv. Value, Rate/MT) | Totals (Total MT, Total Inv. Value, Avg Rate)
// ---------------------------------------------------------------------------
const LEAD = ["Section", "Weight (MT)", "Rate (Rs/MT)", "Basic"];
const SUB = ["MT", "Invoice Value", "Rate/MT"];
const TOTALS = ["Total MT", "Total Inv. Value", "Avg Rate"];

function cells(r, units = PO_GROUPS) {
  const out = [r.section, fmtNum(r.weightMT), fmtNum(r.rate), fmtNum(r.basic)];
  units.forEach((g) => {
    const b = r.buckets[g];
    out.push(fmtNum(b.mt), fmtNum(b.value), b.mt > 0 ? fmtNum(bucketRate(b)) : "-");
  });
  out.push(fmtNum(r.totalMT), fmtNum(r.totalValue), r.totalMT > 0 ? fmtNum(r.avgRate) : "-");
  return out;
}

function exportHeadRows() {
  const top = [...LEAD];
  const sub = LEAD.map(() => "");
  PO_GROUPS.forEach((g) => {
    top.push(g, "", "");
    sub.push(...SUB);
  });
  top.push("Totals", "", "");
  sub.push(...TOTALS);
  return [top, sub];
}

function stamp() {
  return new Date().toISOString().slice(0, 10);
}

function exportToExcel(rows, total) {
  const [top, sub] = exportHeadRows();
  const ws = XLSX.utils.aoa_to_sheet([top, sub, ...rows.map(cells), cells(total)]);
  const merges = [];
  LEAD.forEach((_, c) => merges.push({ s: { r: 0, c }, e: { r: 1, c } }));
  for (let c = LEAD.length; c < top.length; c += 3)
    merges.push({ s: { r: 0, c }, e: { r: 0, c: c + 2 } });
  ws["!merges"] = merges;
  ws["!cols"] = [{ wch: 30 }, ...Array(top.length - 1).fill({ wch: 15 })];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Average Price");
  XLSX.writeFile(wb, `Average-Price-Report-${stamp()}.xlsx`);
}

async function exportToPDF(rows, total, company, fy) {
  // Only the selected company's block is printed: Group = ST drops the SIEC
  // columns (and vice versa). With no Group selected, every block is printed.
  const units = PO_GROUPS.includes(company) ? [company] : PO_GROUPS;
  const { default: jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  drawPdfCompany(doc, company);
  doc.setFontSize(11);
  doc.setFont(undefined, "normal");
  doc.text(`Average Price Report${fy !== "all" ? ` - FY ${fyLabel(Number(fy))}` : ""}`, 40, 40);
  doc.setFontSize(9);
  doc.text(`Sections: ${rows.length}`, 40, 58);

  const head = [
    [
      ...LEAD.map((h) => ({ content: h, rowSpan: 2, styles: { valign: "middle" } })),
      ...units.map((g) => ({ content: g, colSpan: 3, styles: { halign: "center" } })),
      { content: "Totals", colSpan: 3, styles: { halign: "center" } },
    ],
    [...units.flatMap(() => SUB), ...TOTALS],
  ];
  autoTable(doc, {
    head,
    body: rows.map((r) => cells(r, units).map(String)),
    foot: [cells(total, units).map(String)],
    startY: 72,
    margin: { left: 30, right: 30 },
    theme: "grid",
    styles: {
      fontSize: 6.5,
      cellPadding: 2.5,
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
      Array.from({ length: LEAD.length + units.length * 3 + 3 - 1 }, (_, i) => [
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
            { label: "Sections", value: report ? visibleRows.length : "—" },
            { label: "Generated", value: fmtToday() },
          ]}
        />
        <div className="avgp-actions">
          <button
            onClick={() => exportToExcel(visibleRows, total)}
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
            placeholder="Search section…"
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
                <th rowSpan={2}>Section</th>
                <th rowSpan={2} className="text-right">Weight (MT)</th>
                <th rowSpan={2} className="text-right">Rate (₹/MT)</th>
                <th rowSpan={2} className="text-right">Basic</th>
                {PO_GROUPS.map((g) => (
                  <th key={g} colSpan={3} className="avgp-group">
                    {g}
                  </th>
                ))}
                <th colSpan={3} className="avgp-group">
                  Totals
                </th>
              </tr>
              <tr>
                {[...PO_GROUPS, "Totals"].flatMap((g, gi) =>
                  (g === "Totals" ? TOTALS : SUB).map((h, i) => (
                    <th key={`${g}-${h}`} className={`text-right${i === 0 ? " avgp-sep" : ""}`}>
                      {h}
                    </th>
                  ))
                )}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((r) => (
                <tr key={r.section}>
                  <td className="text-rivet">{r.section}</td>
                  <td className="text-right tabular">{fmtNum(r.weightMT)}</td>
                  <td className="text-right tabular">{fmtNum(r.rate)}</td>
                  <td className="text-right tabular">{fmtNum(r.basic)}</td>
                  {PO_GROUPS.map((g) => {
                    const b = r.buckets[g];
                    return (
                      <FragmentCells key={g}>
                        <td className="text-right tabular avgp-sep">{fmtNum(b.mt)}</td>
                        <td className="text-right tabular">{fmtNum(b.value)}</td>
                        <td className="text-right tabular">
                          {b.mt > 0 ? fmtNum(bucketRate(b)) : "-"}
                        </td>
                      </FragmentCells>
                    );
                  })}
                  <td className="text-right tabular avgp-sep">{fmtNum(r.totalMT)}</td>
                  <td className="text-right tabular" style={{ fontWeight: 600 }}>
                    {fmtNum(r.totalValue)}
                  </td>
                  <td className="text-right tabular text-rivet2" style={{ fontWeight: 600 }}>
                    {r.totalMT > 0 ? fmtNum(r.avgRate) : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Grand Total</td>
                <td className="text-right tabular">{fmtNum(total.weightMT)}</td>
                <td className="text-right tabular">{fmtNum(total.rate)}</td>
                <td className="text-right tabular">{fmtINR(total.basic)}</td>
                {PO_GROUPS.map((g) => {
                  const b = total.buckets[g];
                  return (
                    <FragmentCells key={g}>
                      <td className="text-right tabular avgp-sep">{fmtNum(b.mt)}</td>
                      <td className="text-right tabular">{fmtINR(b.value)}</td>
                      <td className="text-right tabular">
                        {b.mt > 0 ? fmtNum(bucketRate(b)) : "-"}
                      </td>
                    </FragmentCells>
                  );
                })}
                <td className="text-right tabular avgp-sep">{fmtNum(total.totalMT)}</td>
                <td className="text-right tabular">{fmtINR(total.totalValue)}</td>
                <td className="text-right tabular text-rivet2">
                  {total.totalMT > 0 ? fmtNum(total.avgRate) : "-"}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {!loading && report && visibleRows.length === 0 && (
        <div className="empty-state" style={{ marginTop: "1.5rem" }}>
          {report.rows.length === 0
            ? "No PO items to report on yet."
            : "No sections match your filters."}
        </div>
      )}
    </div>
  );
}

// Tiny helper so each group's three <td>s can sit under one keyed element.
function FragmentCells({ children }) {
  return <>{children}</>;
}