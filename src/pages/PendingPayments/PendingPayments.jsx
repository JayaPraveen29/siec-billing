import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { RefreshCw, FileSpreadsheet, FileText, Search } from "lucide-react";
import { fetchAllPOData } from "../../services/poService";
import {
  computePendingPaymentsReport,
  filterPendingRows,
  sumPendingRows,
  ageClass,
  AGE_BUCKETS,
  PAYMENT_STATUS_LABELS,
} from "../../utils/pendingPaymentsReport";
import { fmtNum, fmtINR, fmtDate } from "../../utils/format";
import {
  exportPendingPaymentsToExcel,
  exportPendingPaymentsToPDF,
} from "../../utils/pendingPaymentsExport";
import TitleBlock from "../../components/TitleBlock";
import Loading from "../../components/Loading";
import "./PendingPayments.css";

// Options for the "Group" dropdown. Keep in sync with the PO create page.
const PO_GROUPS = ["SIEC", "ST"];

const PAYMENT_FILTERS = [
  { value: "all", label: "All Pending" },
  { value: "unpaid", label: "Unpaid" },
  { value: "partially-paid", label: "Partially Paid" },
];

export default function PendingPayments() {
  const navigate = useNavigate();
  const [allData, setAllData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exportingPdf, setExportingPdf] = useState(false);

  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("all");
  const [ageBucket, setAgeBucket] = useState("all");

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
    return computePendingPaymentsReport(
      allData.filter((d) => group === "all" || d.po.group === group)
    );
  }, [allData, group]);

  const visibleRows = useMemo(() => {
    if (!report) return [];
    return filterPendingRows(report.rows, {
      search,
      fromDate,
      toDate,
      paymentStatus,
      ageBucket,
    });
  }, [report, search, fromDate, toDate, paymentStatus, ageBucket]);

  // Totals follow the filters, so they always match the rows on screen.
  const totals = useMemo(() => sumPendingRows(visibleRows), [visibleRows]);

  function handleExportExcel() {
    if (!report) return;
    exportPendingPaymentsToExcel(totals, visibleRows);
  }

  async function handleExportPdf() {
    if (!report) return;
    setExportingPdf(true);
    try {
      await exportPendingPaymentsToPDF(totals, visibleRows);
    } finally {
      setExportingPdf(false);
    }
  }

  function clearFilters() {
    setSearch("");
    setFromDate("");
    setToDate("");
    setPaymentStatus("all");
    setAgeBucket("all");
    setGroup("all");
  }

  const hasFilters =
    search || fromDate || toDate || paymentStatus !== "all" || ageBucket !== "all" || group !== "all";

  return (
    <div className="pending-page">
      <div className="pending-header">
        <TitleBlock
          docType="PENDING PAYMENTS"
          fields={[
            { label: "Pending Bills", value: report ? report.rows.length : "—" },
            { label: "Generated", value: new Date().toLocaleDateString("en-GB") },
          ]}
        />
        <div className="pending-actions">
          <button
            onClick={handleExportExcel}
            className="pending-export-btn"
            disabled={!report || loading}
            title="Export to Excel"
          >
            <FileSpreadsheet size={15} />
            Excel
          </button>
          <button
            onClick={handleExportPdf}
            className="pending-export-btn"
            disabled={!report || loading || exportingPdf}
            title="Export to PDF"
          >
            <FileText size={15} className={exportingPdf ? "spinning" : ""} />
            PDF
          </button>
          <button onClick={load} className="pending-refresh">
            <RefreshCw size={15} className={loading ? "spinning" : ""} />
            Refresh
          </button>
        </div>
      </div>

      <div className="pending-controls">
        <div className="pending-search">
          <Search size={15} className="text-muted" />
          <input
            type="text"
            placeholder="Search bill no. or PO code…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="pending-date-range">
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
        <select value={group} onChange={(e) => setGroup(e.target.value)}>
          <option value="all">Group</option>
          {PO_GROUPS.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <select value={ageBucket} onChange={(e) => setAgeBucket(e.target.value)}>
          {AGE_BUCKETS.map((b) => (
            <option key={b.value} value={b.value}>
              {b.label}
            </option>
          ))}
        </select>
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
        {hasFilters && (
          <button type="button" className="pending-clear" onClick={clearFilters}>
            Clear filters
          </button>
        )}
      </div>

      {loading && <Loading label="Compiling report" />}

      {!loading && report && (
        <div className="table-scroll pending-table-wrap">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Bill No.</th>
                <th>Bill Date</th>
                <th>PO</th>
                <th className="text-right">Gross Value</th>
                <th className="text-right">Mat. Adv.</th>
                <th className="text-right">TDS</th>
                <th className="text-right">Net Recv.</th>
                <th className="text-right">Paid</th>
                <th className="text-right">Balance</th>
                <th className="text-right">Days Due</th>
                <th>Payment Status</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((r) => (
                <tr
                  key={`${r.poId}-${r.billNo}-${r.billDate}`}
                  className="pending-row"
                  onClick={() => navigate(`/po/${r.poId}`)}
                >
                  <td className="text-rivet">{r.billNo}</td>
                  <td>{fmtDate(r.billDate)}</td>
                  <td>{r.poCode}</td>
                  <td className="text-right tabular" style={{ fontWeight: 600 }}>
                    {fmtNum(r.grossValue, 2)}
                  </td>
                  <td className="text-right tabular">{fmtNum(r.matAdvance, 0)}</td>
                  <td className="text-right tabular">{fmtNum(r.tds, 0)}</td>
                  <td className="text-right tabular text-rivet2">
                    {fmtNum(r.netReceivable, 0)}
                  </td>
                  <td className="text-right tabular">{fmtNum(r.paymentReceived, 0)}</td>
                  <td className="text-right tabular text-warn">
                    {fmtNum(r.balanceToReceive, 0)}
                  </td>
                  <td className={`text-right tabular pending-days ${ageClass(r.daysDue)}`}>
                    {r.daysDue ?? "-"}
                  </td>
                  <td>
                    <span className={`pending-badge pay-${r.paymentStatus}`}>
                      {PAYMENT_STATUS_LABELS[r.paymentStatus]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total Pending</td>
                <td></td>
                <td></td>
                <td className="text-right tabular">{fmtINR(totals.grossValue)}</td>
                <td className="text-right tabular">{fmtINR(totals.matAdvance)}</td>
                <td className="text-right tabular">{fmtINR(totals.tds)}</td>
                <td className="text-right tabular text-rivet2">
                  {fmtINR(totals.netReceivable)}
                </td>
                <td className="text-right tabular">{fmtINR(totals.paymentReceived)}</td>
                <td className="text-right tabular">{fmtINR(totals.balanceToReceive)}</td>
                <td></td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {!loading && report && visibleRows.length === 0 && (
        <div className="empty-state" style={{ marginTop: "1.5rem" }}>
          {report.rows.length === 0
            ? "No pending payments — every bill is settled."
            : "No pending bills match your filters."}
        </div>
      )}
    </div>
  );
}
