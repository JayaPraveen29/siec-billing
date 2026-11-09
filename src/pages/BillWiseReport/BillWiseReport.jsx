import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { RefreshCw, FileSpreadsheet, FileText, Search } from "lucide-react";
import { fetchAllPOData } from "../../services/poService";
import {
  computeBillWiseReport,
  filterBillWiseRows,
  billWiseShowArea,
  billWiseQtyColumns,
} from "../../utils/billWiseReport";
import * as XLSX from "xlsx";
import { computePOLedger } from "../../utils/ledger";
import { fmtNum, fmtINR, fmtDate , fmtToday, drawPdfCompany } from "../../utils/format";
import GroupSelect, { WorkTypeSelect } from "../../components/GroupSelect";
import { matchesGroup, matchesWorkType } from "../../utils/groups";
import { companyName } from "../../utils/format";
import TitleBlock from "../../components/TitleBlock";
import Loading from "../../components/Loading";
import "./BillWiseReport.css";


const PAYMENT_FILTERS = [
  { value: "all", label: "All Payment Status" },
  { value: "fully-paid", label: "Fully Paid" },
  { value: "partially-paid", label: "Partially Paid" },
  { value: "unpaid", label: "Unpaid" },
];

// ---------------------------------------------------------------------------
// Coal Tub (CT) view: the GST TDS (2% of Basic) is deducted from every CT bill,
// so the table carries a GST TDS column and drops the Mat. Adv. column
// (CT POs take no material advance). Both live in this page file only.
// ---------------------------------------------------------------------------

// Adds `gstTds` to every bill row (taken from the PO ledger, so manual
// overrides made on the PO sheet are honoured) and to the grand total.
function withGstTds(base, poSheets) {
  const gstTdsByBill = new Map();
  poSheets.forEach(({ po, items, invoices }) => {
    computePOLedger(po, items, invoices).invoiceRows.forEach((inv) => {
      gstTdsByBill.set(`${po.id}|${inv.invoiceNo}|${inv.invoiceDate}`, inv.gstTds || 0);
    });
  });
  const rows = base.rows.map((r) => ({
    ...r,
    gstTds: gstTdsByBill.get(`${r.poId}|${r.billNo}|${r.billDate}`) || 0,
  }));
  const gstTds = rows.reduce((s, r) => s + r.gstTds, 0);
  return { rows, grandTotal: { ...base.grandTotal, gstTds } };
}

function stamp() {
  return new Date().toISOString().slice(0, 10);
}

// Export column specs - kept in step with the on-screen table.
// `v` = row value, `t` = Grand Total value, `w` = Excel width, `right` = PDF alignment.
function buildColumns({ showArea, qtyCols, ctMode }) {
  const cols = [
    { h: "Bill No.", v: (r) => r.billNo, t: () => "Grand Total", w: 12 },
    { h: "Bill Date", v: (r) => fmtDate(r.billDate), w: 12 },
    { h: "PO", v: (r) => r.poCode, w: 16 },
  ];
  if (showArea) cols.push({ h: "Area", v: (r) => r.area || "-", w: 18 });
  qtyCols.forEach((c) =>
    cols.push({
      h: c.label,
      v: (r) => (r[c.key] > 0 ? fmtNum(r[c.key], c.type === "CT" ? 0 : 1) : "-"),
      t: (g) => fmtNum(g[c.key], c.type === "CT" ? 0 : 1),
      w: 12,
      right: true,
    })
  );
  cols.push({ h: "Gross Value", v: (r) => fmtNum(r.grossValue, 2), t: (g) => fmtNum(g.grossValue, 2), w: 13, right: true });
  // Mat. Adv. is dropped only when Work Type = CT; GST TDS is always shown.
  if (!ctMode) {
    cols.push({ h: "Mat. Adv.", v: (r) => fmtNum(r.matAdvance, 0), t: (g) => fmtNum(g.matAdvance, 0), w: 11, right: true });
  }
  cols.push(
    { h: "GST TDS", v: (r) => fmtNum(r.gstTds, 0), t: (g) => fmtNum(g.gstTds, 0), w: 11, right: true },
    { h: "TDS", v: (r) => fmtNum(r.tds, 0), t: (g) => fmtNum(g.tds, 0), w: 10, right: true },
    { h: "Net Recv.", v: (r) => fmtNum(r.netReceivable, 0), t: (g) => fmtNum(g.netReceivable, 0), w: 13, right: true },
    { h: "Payment Date", v: (r) => (r.paymentDate ? fmtDate(r.paymentDate) : "-"), w: 13 },
    { h: "Paid", v: (r) => fmtNum(r.paymentReceived, 0), t: (g) => fmtNum(g.paymentReceived, 0), w: 12, right: true },
    { h: "Balance", v: (r) => fmtNum(r.balanceToReceive, 0), t: (g) => fmtNum(g.balanceToReceive, 0), w: 12, right: true }
  );
  return cols;
}

function exportToExcel(report, rows, opts) {
  const cols = buildColumns(opts);
  const data = [cols.map((c) => c.h)];
  rows.forEach((r) => data.push(cols.map((c) => c.v(r))));
  data.push(cols.map((c) => (c.t ? c.t(report.grandTotal) : "")));
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = cols.map((c) => ({ wch: c.w }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Bill Wise Report");
  XLSX.writeFile(wb, `Bill-Wise-Report-${stamp()}.xlsx`);
}

async function exportToPDF(report, rows, company, opts) {
  const { default: jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  drawPdfCompany(doc, company);
  doc.setFontSize(11);
  doc.setFont(undefined, "normal");
  doc.text("Bill Wise Report", 40, 40);
  doc.setFontSize(9);
  doc.text(`Bills: ${rows.length}`, 40, 58);

  const cols = buildColumns(opts);
  const columnStyles = {};
  cols.forEach((c, i) => {
    if (c.right) columnStyles[i] = { halign: "right" };
  });
  autoTable(doc, {
    head: [cols.map((c) => c.h)],
    body: rows.map((r) => cols.map((c) => String(c.v(r)))),
    foot: [cols.map((c) => (c.t ? String(c.t(report.grandTotal)) : ""))],
    startY: 72,
    margin: { left: 40, right: 40 },
    theme: "grid",
    styles: {
      fontSize: 7,
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
    columnStyles,
  });
  doc.save(`Bill-Wise-Report-${stamp()}.pdf`);
}

export default function BillWiseReport() {
  const navigate = useNavigate();
  const [allData, setAllData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exportingPdf, setExportingPdf] = useState(false);

  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("all");
  const [workType, setWorkType] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("all");

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
    const sheets = allData.filter(
      (d) => matchesGroup(d.po.group, group) && matchesWorkType(d.po.workType, workType)
    );
    return withGstTds(computeBillWiseReport(sheets), sheets);
  }, [allData, group, workType]);

  // Work Type = CT: Mat. Adv. column is hidden (GST TDS is always shown).
  const ctMode = workType === "CT";
  const showArea = billWiseShowArea(workType);
  const qtyCols = billWiseQtyColumns(workType);

  const visibleRows = useMemo(() => {
    if (!report) return [];
    return filterBillWiseRows(report.rows, {
      search,
      fromDate,
      toDate,
      paymentStatus,
    });
  }, [report, search, fromDate, toDate, paymentStatus]);

  function handleExportExcel() {
    if (!report) return;
    exportToExcel(report, visibleRows, { showArea, qtyCols, ctMode });
  }

  async function handleExportPdf() {
    if (!report) return;
    setExportingPdf(true);
    try {
      await exportToPDF(report, visibleRows, group, { showArea, qtyCols, ctMode });
    } finally {
      setExportingPdf(false);
    }
  }

  function clearFilters() {
    setSearch("");
    setFromDate("");
    setToDate("");
    setPaymentStatus("all");
    setGroup("all");
    setWorkType("all");
  }

  return (
    <div className="billwise-page">
      <div className="billwise-header">
        <TitleBlock
          company={companyName(group)}
          docType="BILL WISE REPORT"
          fields={[
            { label: "Bills", value: report ? report.rows.length : "—" },
            { label: "Generated", value: fmtToday() },
          ]}
        />
        <div className="billwise-actions">
          <button
            onClick={handleExportExcel}
            className="billwise-export-btn"
            disabled={!report || loading}
            title="Export to Excel"
          >
            <FileSpreadsheet size={15} />
            Excel
          </button>
          <button
            onClick={handleExportPdf}
            className="billwise-export-btn"
            disabled={!report || loading || exportingPdf}
            title="Export to PDF"
          >
            <FileText size={15} className={exportingPdf ? "spinning" : ""} />
            PDF
          </button>
          <button onClick={load} className="billwise-refresh">
            <RefreshCw size={15} className={loading ? "spinning" : ""} />
            Refresh
          </button>
        </div>
      </div>

      <div className="billwise-controls">
        <div className="billwise-search">
          <Search size={15} className="text-muted" />
          <input
            type="text"
            placeholder="Search bill no. or PO code…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="billwise-date-range">
          <label>
            From
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </label>
          <label>
            To
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </label>
        </div>
        <GroupSelect value={group} onChange={setGroup} />
<WorkTypeSelect value={workType} onChange={setWorkType} />
        <select
          value={paymentStatus}
          onChange={(e) => setPaymentStatus(e.target.value)}
        >
          {PAYMENT_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        {(search || fromDate || toDate || paymentStatus !== "all" || group !== "all" || workType !== "all") && (
          <button type="button" className="billwise-clear" onClick={clearFilters}>
            Clear filters
          </button>
        )}
      </div>

      {loading && <Loading label="Compiling report" />}

      {!loading && report && (
        <div className="table-scroll billwise-table-wrap">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Bill No.</th>
                <th>Bill Date</th>
                <th>PO</th>
                {showArea && <th>Area</th>}
                {qtyCols.map((c) => (
                  <th key={c.key} className="text-right">{c.label}</th>
                ))}
                <th className="text-right">Gross Value</th>
                {!ctMode && <th className="text-right">Mat. Adv.</th>}
                <th className="text-right">GST TDS</th>
                <th className="text-right">TDS</th>
                <th className="text-right">Net Recv.</th>
                <th>Payment Date</th>
                <th className="text-right">Paid</th>
                <th className="text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((r) => (
                <tr
                  key={`${r.poId}-${r.billNo}-${r.billDate}`}
                  className="billwise-row"
                  onClick={() => navigate(`/po/${r.poId}`)}
                >
                  <td className="text-rivet">{r.billNo}</td>
                  <td>{fmtDate(r.billDate)}</td>
                  <td>{r.poCode}</td>
                  {showArea && <td>{r.area || "-"}</td>}
                  {qtyCols.map((c) => (
                    <td key={c.key} className="text-right tabular">
                      {r[c.key] > 0 ? fmtNum(r[c.key], c.type === "CT" ? 0 : 1) : "-"}
                    </td>
                  ))}
                  <td className="text-right tabular" style={{ fontWeight: 600 }}>
                    {fmtNum(r.grossValue, 2)}
                  </td>
                  {!ctMode && <td className="text-right tabular">{fmtNum(r.matAdvance, 0)}</td>}
                  <td className="text-right tabular">{fmtNum(r.gstTds, 0)}</td>
                  <td className="text-right tabular">{fmtNum(r.tds, 0)}</td>
                  <td className="text-right tabular text-rivet2">
                    {fmtNum(r.netReceivable, 0)}
                  </td>
                  <td>{r.paymentDate ? fmtDate(r.paymentDate) : "-"}</td>
                  <td className="text-right tabular">{fmtNum(r.paymentReceived, 0)}</td>
                  <td
                    className={`text-right tabular ${
                      r.balanceToReceive > 0.5 ? "text-warn" : "text-ok"
                    }`}
                  >
                    {fmtNum(r.balanceToReceive, 0)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Grand Total</td>
                <td></td>
                <td></td>
                {showArea && <td></td>}
                {qtyCols.map((c) => (
                  <td key={c.key} className="text-right tabular">
                    {fmtNum(report.grandTotal[c.key], c.type === "CT" ? 0 : 1)}
                  </td>
                ))}
                <td className="text-right tabular">{fmtINR(report.grandTotal.grossValue)}</td>
                {!ctMode && (
                  <td className="text-right tabular">{fmtINR(report.grandTotal.matAdvance)}</td>
                )}
                <td className="text-right tabular">{fmtINR(report.grandTotal.gstTds)}</td>
                <td className="text-right tabular">{fmtINR(report.grandTotal.tds)}</td>
                <td className="text-right tabular text-rivet2">
                  {fmtINR(report.grandTotal.netReceivable)}
                </td>
                <td></td>
                <td className="text-right tabular">
                  {fmtINR(report.grandTotal.paymentReceived)}
                </td>
                <td className="text-right tabular">
                  {fmtINR(report.grandTotal.balanceToReceive)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {!loading && report && visibleRows.length === 0 && (
        <div className="empty-state" style={{ marginTop: "1.5rem" }}>
          {report.rows.length === 0
            ? "No bills to report on yet."
            : "No bills match your filters."}
        </div>
      )}
    </div>
  );
}