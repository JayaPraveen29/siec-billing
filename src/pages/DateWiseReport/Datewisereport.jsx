import { useEffect, useMemo, useState } from "react";
import { CalendarRange, RefreshCw, FileSpreadsheet, FileText } from "lucide-react";
import { fetchAllPOData } from "../../services/poService";
import { computeDateWiseReport } from "../../utils/dateWiseReport";
import { fmtNum, fmtINR, fmtDate } from "../../utils/format";
import {
  exportDateWiseReportToExcel,
  exportDateWiseReportToPDF,
} from "../../utils/dateWiseExport";
import TitleBlock from "../../components/TitleBlock";
import Loading from "../../components/Loading";
import "./Datewisereport.css";

// Options for the "Group" dropdown. Keep in sync with the PO create page.
const PO_GROUPS = ["SIEC", "ST"];

const TABS = [
  { key: "invoiceDate", label: "Invoice Date", pendingLabel: "No Invoice Date" },
  { key: "paymentDate", label: "Payment Date", pendingLabel: "Pending / Unpaid" },
];

function currentMonthRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export default function DateWiseReport() {
  const [tab, setTab] = useState("invoiceDate");
  const [group, setGroup] = useState("all");
  const [allData, setAllData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exportingPdf, setExportingPdf] = useState(false);

  const defaultRange = useMemo(currentMonthRange, []);
  const [rangeMode, setRangeMode] = useState("month"); // "month" | "all" | "custom"
  const [fromDate, setFromDate] = useState(defaultRange.from);
  const [toDate, setToDate] = useState(defaultRange.to);

  async function load() {
    setLoading(true);
    const all = await fetchAllPOData();
    setAllData(all);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const activeTab = TABS.find((t) => t.key === tab);

  const report = useMemo(() => {
    if (!allData) return null;
    const bounds = rangeMode === "all" ? {} : { fromDate, toDate };
    const scoped = allData.filter((d) => group === "all" || d.po.group === group);
    return computeDateWiseReport(scoped, tab, bounds);
  }, [allData, group, tab, rangeMode, fromDate, toDate]);

  function handleExportExcel() {
    if (!report) return;
    exportDateWiseReportToExcel(report, { dateLabel: activeTab.label });
  }

  async function handleExportPdf() {
    if (!report) return;
    setExportingPdf(true);
    try {
      await exportDateWiseReportToPDF(report, { dateLabel: activeTab.label });
    } finally {
      setExportingPdf(false);
    }
  }

  return (
    <div className="datewise-page">
      <div className="datewise-header">
        <TitleBlock
          docType="DATE WISE REPORT"
          fields={[
            { label: "Days", value: report ? report.days.length : "—" },
            { label: "Generated", value: new Date().toLocaleDateString("en-GB") },
          ]}
        />
        <div className="datewise-actions">
          <button
            onClick={handleExportExcel}
            className="datewise-export-btn"
            disabled={!report || loading}
            title="Export to Excel"
          >
            <FileSpreadsheet size={15} />
            Excel
          </button>
          <button
            onClick={handleExportPdf}
            className="datewise-export-btn"
            disabled={!report || loading || exportingPdf}
            title="Export to PDF"
          >
            <FileText size={15} className={exportingPdf ? "spinning" : ""} />
            PDF
          </button>
          <button onClick={load} className="datewise-refresh">
            <RefreshCw size={15} className={loading ? "spinning" : ""} />
            Refresh
          </button>
        </div>
      </div>

      <div className="datewise-controls">
        <div className="datewise-tabs">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={`datewise-tab${tab === t.key ? " active" : ""}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="datewise-range">
          <select value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="all">All Groups</option>
            {PO_GROUPS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          <CalendarRange size={15} className="text-muted" />
          <select value={rangeMode} onChange={(e) => setRangeMode(e.target.value)}>
            <option value="month">This Month</option>
            <option value="custom">Custom Range</option>
            <option value="all">All Time</option>
          </select>
          {rangeMode === "custom" && (
            <>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
              <span className="text-muted">to</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </>
          )}
        </div>
      </div>

      {loading && <Loading label="Compiling report" />}

      {!loading && report && (
        <div className="table-scroll datewise-table-wrap">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>PO</th>
                <th>Inv. No.</th>
                <th className="text-right">Wt./Kg</th>
                <th className="text-right">Basic</th>
                <th className="text-right">GST</th>
                <th className="text-right">TDS</th>
                <th className="text-right">Round Off</th>
                <th className="text-right">Gross Value</th>
                <th className="text-right">Mat. Adv.</th>
                <th className="text-right">Net Recv.</th>
                <th>Paid On</th>
                <th className="text-right">Paid Amount</th>
                <th className="text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {report.days.map((d) => (
                <DayRows key={d.date} day={d} />
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>Grand Total</td>
                <td className="text-right tabular">{fmtNum(report.grandTotal.qty, 1)}</td>
                <td className="text-right tabular">{fmtNum(report.grandTotal.basic, 0)}</td>
                <td className="text-right tabular">{fmtNum(report.grandTotal.gst, 0)}</td>
                <td className="text-right tabular">{fmtNum(report.grandTotal.tds, 0)}</td>
                <td className="text-right tabular">
                  {fmtNum(report.grandTotal.roundOff, 2)}
                </td>
                <td className="text-right tabular">
                  {fmtINR(report.grandTotal.grossValue)}
                </td>
                <td className="text-right tabular">
                  {fmtINR(report.grandTotal.matAdvance)}
                </td>
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

      {!loading && report && report.days.length === 0 && report.pending.length === 0 && (
        <div className="empty-state" style={{ marginTop: "1.5rem" }}>
          No invoices fall in this range.
        </div>
      )}

      {!loading && report && report.pending.length > 0 && (
        <div className="datewise-pending">
          <div className="datewise-pending-title">
            {activeTab.pendingLabel} ({report.pending.length})
          </div>
          <div className="table-scroll">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>PO</th>
                  <th>Inv. No.</th>
                  <th>Inv. Date</th>
                  <th className="text-right">Wt./Kg</th>
                  <th className="text-right">Gross Value</th>
                  <th className="text-right">Net Recv.</th>
                  <th className="text-right">Paid Amount</th>
                  <th className="text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {report.pending.map((r, idx) => (
                  <tr key={`${r.poId}-${r.invoiceNo}-${idx}`}>
                    <td className="text-rivet">{r.poCode}</td>
                    <td>{r.invoiceNo}</td>
                    <td>{fmtDate(r.invoiceDate)}</td>
                    <td className="text-right tabular">{fmtNum(r.qty, 1)}</td>
                    <td className="text-right tabular">{fmtNum(r.grossValue, 2)}</td>
                    <td className="text-right tabular text-rivet2">
                      {fmtNum(r.netReceivable, 0)}
                    </td>
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
                  <td colSpan={3}>Subtotal</td>
                  <td className="text-right tabular">{fmtNum(report.pendingSubtotal.qty, 1)}</td>
                  <td className="text-right tabular">
                    {fmtNum(report.pendingSubtotal.grossValue, 2)}
                  </td>
                  <td className="text-right tabular text-rivet2">
                    {fmtNum(report.pendingSubtotal.netReceivable, 0)}
                  </td>
                  <td className="text-right tabular">
                    {fmtNum(report.pendingSubtotal.paymentReceived, 0)}
                  </td>
                  <td className="text-right tabular">
                    {fmtNum(report.pendingSubtotal.balanceToReceive, 0)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function DayRows({ day }) {
  return (
    <>
      {day.rows.map((r, idx) => (
        <tr key={`${r.poId}-${r.invoiceNo}-${idx}`}>
          <td className="text-rivet">{idx === 0 ? fmtDate(day.date) : ""}</td>
          <td>{r.poCode}</td>
          <td>{r.invoiceNo}</td>
          <td className="text-right tabular">{fmtNum(r.qty, 1)}</td>
          <td className="text-right tabular">{fmtNum(r.basic, 0)}</td>
          <td className="text-right tabular">{fmtNum(r.gst, 0)}</td>
          <td className="text-right tabular">{fmtNum(r.tds, 0)}</td>
          <td className="text-right tabular">{fmtNum(r.roundOff, 2)}</td>
          <td className="text-right tabular" style={{ fontWeight: 600 }}>
            {fmtNum(r.grossValue, 2)}
          </td>
          <td className="text-right tabular">{fmtNum(r.matAdvance, 0)}</td>
          <td className="text-right tabular text-rivet2">{fmtNum(r.netReceivable, 0)}</td>
          <td>{fmtDate(r.paymentDate)}</td>
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
      <tr className="datewise-subtotal-row">
        <td colSpan={3}>Subtotal — {fmtDate(day.date)}</td>
        <td className="text-right tabular">{fmtNum(day.subtotal.qty, 1)}</td>
        <td className="text-right tabular">{fmtNum(day.subtotal.basic, 0)}</td>
        <td className="text-right tabular">{fmtNum(day.subtotal.gst, 0)}</td>
        <td className="text-right tabular">{fmtNum(day.subtotal.tds, 0)}</td>
        <td className="text-right tabular">{fmtNum(day.subtotal.roundOff, 2)}</td>
        <td className="text-right tabular">{fmtNum(day.subtotal.grossValue, 2)}</td>
        <td className="text-right tabular">{fmtNum(day.subtotal.matAdvance, 0)}</td>
        <td className="text-right tabular">{fmtNum(day.subtotal.netReceivable, 0)}</td>
        <td></td>
        <td className="text-right tabular">{fmtNum(day.subtotal.paymentReceived, 0)}</td>
        <td className="text-right tabular">{fmtNum(day.subtotal.balanceToReceive, 0)}</td>
      </tr>
    </>
  );
}
