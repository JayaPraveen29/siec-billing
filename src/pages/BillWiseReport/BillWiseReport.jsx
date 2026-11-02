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
import { fmtNum, fmtINR, fmtDate , fmtToday } from "../../utils/format";
import {
  exportBillWiseReportToExcel,
  exportBillWiseReportToPDF,
} from "../../utils/billWiseExport";
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
    return computeBillWiseReport(
      allData.filter((d) => matchesGroup(d.po.group, group) && matchesWorkType(d.po.workType, workType))
    );
  }, [allData, group, workType]);

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
    exportBillWiseReportToExcel(report, visibleRows, { showArea, qtyCols });
  }

  async function handleExportPdf() {
    if (!report) return;
    setExportingPdf(true);
    try {
      await exportBillWiseReportToPDF(report, visibleRows, { company: group, showArea, qtyCols });
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
                <th className="text-right">Mat. Adv.</th>
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
                  <td className="text-right tabular">{fmtNum(r.matAdvance, 0)}</td>
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
                <td className="text-right tabular">{fmtINR(report.grandTotal.matAdvance)}</td>
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
