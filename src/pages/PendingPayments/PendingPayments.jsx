import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { RefreshCw, FileSpreadsheet, FileText, Search } from "lucide-react";
import { fetchAllPOData } from "../../services/poService";
import {
  computePendingPaymentsReport,
  filterPendingRows,
  ageClass,
  AGE_BUCKETS,
  PAYMENT_STATUS_LABELS,
} from "../../utils/pendingPaymentsReport";
import { fmtNum, fmtINR, fmtDate } from "../../utils/format";
import * as XLSX from "xlsx";
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

// ---------------------------------------------------------------------------
// Combine all pending bills of a PO into a single row.
// ---------------------------------------------------------------------------
const MONEY_EPSILON = 1;

function combineByPO(bills) {
  const map = new Map();
  bills.forEach((b) => {
    let g = map.get(b.poId);
    if (!g) {
      g = {
        poId: b.poId,
        poCode: b.poCode,
        billCount: 0,
        oldestBillDate: b.billDate,
        daysDue: b.daysDue,
        netReceivable: 0,
        paymentReceived: 0,
        balanceToReceive: 0,
      };
      map.set(b.poId, g);
    }
    g.billCount += 1;
    g.netReceivable += b.netReceivable;
    g.paymentReceived += b.paymentReceived;
    g.balanceToReceive += b.balanceToReceive;
    if ((b.daysDue ?? -1) > (g.daysDue ?? -1)) {
      g.daysDue = b.daysDue;
      g.oldestBillDate = b.billDate;
    }
  });
  const rows = [...map.values()].map((g) => ({
    ...g,
    paymentStatus: g.paymentReceived <= MONEY_EPSILON ? "unpaid" : "partially-paid",
  }));
  rows.sort((a, b) => (b.daysDue ?? -1) - (a.daysDue ?? -1));
  return rows;
}

function sumRows(rows) {
  return rows.reduce(
    (a, r) => {
      a.billCount += r.billCount;
      a.netReceivable += r.netReceivable;
      a.paymentReceived += r.paymentReceived;
      a.balanceToReceive += r.balanceToReceive;
      return a;
    },
    { billCount: 0, netReceivable: 0, paymentReceived: 0, balanceToReceive: 0 }
  );
}

// ---------------------------------------------------------------------------
// Exports (kept in this file so only one file needs to change)
// ---------------------------------------------------------------------------
const EXPORT_HEADERS = [
  "PO",
  "Pending Bills",
  "Oldest Bill Date",
  "Net Recv.",
  "Paid",
  "Balance",
  "Days Due",
  "Payment Status",
];

function exportRow(r) {
  return [
    r.poCode,
    r.billCount,
    fmtDate(r.oldestBillDate),
    fmtNum(r.netReceivable, 0),
    fmtNum(r.paymentReceived, 0),
    fmtNum(r.balanceToReceive, 0),
    r.daysDue ?? "-",
    PAYMENT_STATUS_LABELS[r.paymentStatus] || r.paymentStatus,
  ];
}

function exportTotal(t) {
  return [
    "Total Pending",
    t.billCount,
    "",
    fmtNum(t.netReceivable, 0),
    fmtNum(t.paymentReceived, 0),
    fmtNum(t.balanceToReceive, 0),
    "",
    "",
  ];
}

function stamp() {
  return new Date().toISOString().slice(0, 10);
}

function exportToExcel(totals, rows) {
  const ws = XLSX.utils.aoa_to_sheet([
    EXPORT_HEADERS,
    ...rows.map(exportRow),
    exportTotal(totals),
  ]);
  ws["!cols"] = [
    { wch: 16 },
    { wch: 14 },
    { wch: 16 },
    { wch: 13 },
    { wch: 12 },
    { wch: 12 },
    { wch: 10 },
    { wch: 15 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Pending Payments");
  XLSX.writeFile(wb, `Pending-Payments-${stamp()}.xlsx`);
}

async function exportToPDF(totals, rows) {
  const { default: jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  doc.setFontSize(11);
  doc.setFont(undefined, "normal");
  doc.text("Pending Payments Report", 40, 40);
  doc.setFontSize(9);
  doc.text(`POs with pending bills: ${rows.length}`, 40, 58);
  autoTable(doc, {
    head: [EXPORT_HEADERS],
    body: rows.map((r) => exportRow(r).map((v) => String(v))),
    foot: [exportTotal(totals).map((v) => String(v))],
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
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right" },
      6: { halign: "right" },
    },
  });
  doc.save(`Pending-Payments-${stamp()}.pdf`);
}

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

  // Filter individual bills first (search / dates / days-due bucket),
  // then combine what is left into one row per PO.
  const visibleRows = useMemo(() => {
    if (!report) return [];
    const bills = filterPendingRows(report.rows, {
      search,
      fromDate,
      toDate,
      paymentStatus: "all",
      ageBucket,
    });
    const combined = combineByPO(bills);
    return paymentStatus === "all"
      ? combined
      : combined.filter((r) => r.paymentStatus === paymentStatus);
  }, [report, search, fromDate, toDate, paymentStatus, ageBucket]);

  // Totals follow the filters, so they always match the rows on screen.
  const totals = useMemo(() => sumRows(visibleRows), [visibleRows]);

  function handleExportExcel() {
    if (!report) return;
    exportToExcel(totals, visibleRows);
  }

  async function handleExportPdf() {
    if (!report) return;
    setExportingPdf(true);
    try {
      await exportToPDF(totals, visibleRows);
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
            { label: "POs Pending", value: report ? combineByPO(report.rows).length : "—" },
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
            placeholder="Search PO code or bill no.…"
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
                <th>PO</th>
                <th className="text-right">Pending Bills</th>
                <th>Oldest Bill</th>
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
                  key={r.poId}
                  className="pending-row"
                  onClick={() => navigate(`/po/${r.poId}`)}
                >
                  <td className="text-rivet">{r.poCode}</td>
                  <td className="text-right tabular">{r.billCount}</td>
                  <td>{fmtDate(r.oldestBillDate)}</td>
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
                <td className="text-right tabular">{totals.billCount}</td>
                <td></td>
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
            : "No pending payments match your filters."}
        </div>
      )}
    </div>
  );
}