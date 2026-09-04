import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { RefreshCw, FileSpreadsheet, FileText, Search } from "lucide-react";
import { fetchAllPOData } from "../../services/poService";
import {
  computePOWiseReport,
  filterPOWiseRows,
  QTY_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
} from "../../utils/poWiseReport";
import { fmtNum, fmtINR } from "../../utils/format";
import {
  exportPOWiseReportToExcel,
  exportPOWiseReportToPDF,
} from "../../utils/poWiseExport";
import TitleBlock from "../../components/TitleBlock";
import Loading from "../../components/Loading";
import "./POWiseReport.css";

const QTY_FILTERS = [
  { value: "all", label: "All Quantity Status" },
  { value: "fully-billed", label: "Fully Billed" },
  { value: "in-progress", label: "In Progress" },
  { value: "not-started", label: "Not Started" },
];

const PAYMENT_FILTERS = [
  { value: "all", label: "All Payment Status" },
  { value: "fully-paid", label: "Fully Paid" },
  { value: "partially-paid", label: "Partially Paid" },
  { value: "unpaid", label: "Unpaid" },
];

export default function POWiseReport() {
  const navigate = useNavigate();
  const [allData, setAllData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exportingPdf, setExportingPdf] = useState(false);

  const [search, setSearch] = useState("");
  const [qtyStatus, setQtyStatus] = useState("all");
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
    return computePOWiseReport(allData);
  }, [allData]);

  const visibleRows = useMemo(() => {
    if (!report) return [];
    return filterPOWiseRows(report.rows, { search, qtyStatus, paymentStatus });
  }, [report, search, qtyStatus, paymentStatus]);

  function handleExportExcel() {
    if (!report) return;
    exportPOWiseReportToExcel(report, visibleRows);
  }

  async function handleExportPdf() {
    if (!report) return;
    setExportingPdf(true);
    try {
      await exportPOWiseReportToPDF(report, visibleRows);
    } finally {
      setExportingPdf(false);
    }
  }

  return (
    <div className="powise-page">
      <div className="powise-header">
        <TitleBlock
          docType="PO WISE REPORT"
          fields={[
            { label: "POs", value: report ? report.rows.length : "—" },
            { label: "Generated", value: new Date().toLocaleDateString("en-GB") },
          ]}
        />
        <div className="powise-actions">
          <button
            onClick={handleExportExcel}
            className="powise-export-btn"
            disabled={!report || loading}
            title="Export to Excel"
          >
            <FileSpreadsheet size={15} />
            Excel
          </button>
          <button
            onClick={handleExportPdf}
            className="powise-export-btn"
            disabled={!report || loading || exportingPdf}
            title="Export to PDF"
          >
            <FileText size={15} className={exportingPdf ? "spinning" : ""} />
            PDF
          </button>
          <button onClick={load} className="powise-refresh">
            <RefreshCw size={15} className={loading ? "spinning" : ""} />
            Refresh
          </button>
        </div>
      </div>

      <div className="powise-controls">
        <div className="powise-search">
          <Search size={15} className="text-muted" />
          <input
            type="text"
            placeholder="Search PO code or number…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select value={qtyStatus} onChange={(e) => setQtyStatus(e.target.value)}>
          {QTY_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)}>
          {PAYMENT_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      {loading && <Loading label="Compiling report" />}

      {!loading && report && (
        <div className="table-scroll powise-table-wrap">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>PO</th>
                <th className="text-right">Invoices</th>
                <th className="text-right">Wt. Ordered</th>
                <th className="text-right">Wt. Billed</th>
                <th className="text-right">Wt. Balance</th>
                <th>Qty Status</th>
                <th className="text-right">Gross Value</th>
                <th className="text-right">Mat. Adv.</th>
                <th className="text-right">TDS</th>
                <th className="text-right">Net Recv.</th>
                <th className="text-right">Paid</th>
                <th className="text-right">Balance</th>
                <th>Payment Status</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((r) => (
                <tr
                  key={r.poId}
                  className="powise-row"
                  onClick={() => navigate(`/po/${r.poId}`)}
                >
                  <td className="text-rivet">{r.poCode}</td>
                  <td className="text-right tabular">{r.invoiceCount}</td>
                  <td className="text-right tabular">{fmtNum(r.weightOrdered, 1)}</td>
                  <td className="text-right tabular">{fmtNum(r.weightBilled, 1)}</td>
                  <td className="text-right tabular">{fmtNum(r.weightBalance, 1)}</td>
                  <td>
                    <span className={`powise-badge qty-${r.qtyStatus}`}>
                      {QTY_STATUS_LABELS[r.qtyStatus]}
                    </span>
                  </td>
                  <td className="text-right tabular" style={{ fontWeight: 600 }}>
                    {fmtNum(r.grossValue, 2)}
                  </td>
                  <td className="text-right tabular">{fmtNum(r.matAdvance, 0)}</td>
                  <td className="text-right tabular">{fmtNum(r.tds, 0)}</td>
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
                  <td>
                    <span className={`powise-badge pay-${r.paymentStatus}`}>
                      {PAYMENT_STATUS_LABELS[r.paymentStatus]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Grand Total</td>
                <td></td>
                <td className="text-right tabular">
                  {fmtNum(report.grandTotal.weightOrdered, 1)}
                </td>
                <td className="text-right tabular">
                  {fmtNum(report.grandTotal.weightBilled, 1)}
                </td>
                <td className="text-right tabular">
                  {fmtNum(report.grandTotal.weightBalance, 1)}
                </td>
                <td></td>
                <td className="text-right tabular">{fmtINR(report.grandTotal.grossValue)}</td>
                <td className="text-right tabular">{fmtINR(report.grandTotal.matAdvance)}</td>
                <td className="text-right tabular">{fmtINR(report.grandTotal.tds)}</td>
                <td className="text-right tabular text-rivet2">
                  {fmtINR(report.grandTotal.netReceivable)}
                </td>
                <td className="text-right tabular">
                  {fmtINR(report.grandTotal.paymentReceived)}
                </td>
                <td className="text-right tabular">
                  {fmtINR(report.grandTotal.balanceToReceive)}
                </td>
                <td></td>
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