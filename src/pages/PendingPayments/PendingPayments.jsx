import { Fragment, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { RefreshCw, FileSpreadsheet, FileText, Search } from "lucide-react";
import * as XLSX from "xlsx";
import { fetchAllPOData } from "../../services/poService";
import {
  computePendingPaymentsReport,
  filterPendingRows,
  ageClass,
  AGE_BUCKETS,
} from "../../utils/pendingPaymentsReport";
import { fmtNum, fmtINR, fmtDate, fmtToday, drawPdfCompany } from "../../utils/format";
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

const COLS = 6;

// "PO: 123  |  PM: Name" heading text (PM only when one is set).
const poHeading = (g) =>
  `PO: ${g.poCode}${g.projectManager ? `  |  PM: ${g.projectManager}` : ""}`;

// ---------------------------------------------------------------------------
// Group the (already filtered) pending bills by PO:
//   PO heading  ->  its pending bills  ->  total for that PO
// POs are ordered by their oldest pending bill (most days due first).
// ---------------------------------------------------------------------------
function sumOf(bills) {
  return bills.reduce(
    (a, b) => {
      a.netReceivable += b.netReceivable;
      a.paymentReceived += b.paymentReceived;
      a.balanceToReceive += b.balanceToReceive;
      return a;
    },
    { netReceivable: 0, paymentReceived: 0, balanceToReceive: 0 }
  );
}

function groupByPO(bills) {
  const map = new Map();
  bills.forEach((b) => {
    if (!map.has(b.poId))
      map.set(b.poId, {
        poId: b.poId,
        poCode: b.poCode,
        projectManager: b.projectManager || "",
        bills: [],
      });
    map.get(b.poId).bills.push(b);
  });
  const groups = [...map.values()].map((g) => {
    // Oldest bill first inside each PO.
    g.bills.sort((a, b) => (b.daysDue ?? -1) - (a.daysDue ?? -1));
    return {
      ...g,
      total: { ...sumOf(g.bills), billCount: g.bills.length },
      maxDaysDue: g.bills[0]?.daysDue ?? null,
    };
  });
  groups.sort((a, b) => (b.maxDaysDue ?? -1) - (a.maxDaysDue ?? -1));
  return groups;
}

// ---------------------------------------------------------------------------
// Exports (kept in this file so only one file needs to change)
// ---------------------------------------------------------------------------
const EXPORT_HEADERS = [
  "Bill No.",
  "Bill Date",
  "Net Recv.",
  "Paid",
  "Balance",
  "Days Due",
];

// Flatten groups into table rows tagged by kind: "po" | "bill" | "total" | "grand".
function buildExportRows(groups, grand) {
  const out = [];
  groups.forEach((g) => {
    out.push({ kind: "po", cells: [poHeading(g), "", "", "", "", ""] });
    g.bills.forEach((b) =>
      out.push({
        kind: "bill",
        cells: [
          b.billNo,
          fmtDate(b.billDate),
          fmtNum(b.netReceivable, 0),
          fmtNum(b.paymentReceived, 0),
          fmtNum(b.balanceToReceive, 0),
          b.daysDue ?? "-",
        ],
      })
    );
    out.push({
      kind: "total",
      cells: [
        "Total",
        "",
        fmtNum(g.total.netReceivable, 0),
        fmtNum(g.total.paymentReceived, 0),
        fmtNum(g.total.balanceToReceive, 0),
        "",
      ],
    });
  });
  out.push({
    kind: "grand",
    cells: [
      "Grand Total",
      "",
      fmtNum(grand.netReceivable, 0),
      fmtNum(grand.paymentReceived, 0),
      fmtNum(grand.balanceToReceive, 0),
      "",
    ],
  });
  return out;
}

function stamp() {
  return new Date().toISOString().slice(0, 10);
}

function exportToExcel(groups, grand) {
  const rows = buildExportRows(groups, grand);
  const ws = XLSX.utils.aoa_to_sheet([EXPORT_HEADERS, ...rows.map((r) => r.cells)]);
  ws["!cols"] = [
    { wch: 18 },
    { wch: 14 },
    { wch: 13 },
    { wch: 12 },
    { wch: 12 },
    { wch: 10 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Pending Payments");
  XLSX.writeFile(wb, `Pending-Payments-${stamp()}.xlsx`);
}

async function exportToPDF(groups, grand, company) {
  const { default: jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const rows = buildExportRows(groups, grand);

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  drawPdfCompany(doc, company);
  doc.setFontSize(11);
  doc.setFont(undefined, "normal");
  doc.text("Pending Payments Report", 40, 40);
  doc.setFontSize(9);
  doc.text(`POs: ${groups.length}`, 40, 58);

  autoTable(doc, {
    head: [EXPORT_HEADERS],
    body: rows.map((r) => r.cells.map((v) => String(v))),
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
    alternateRowStyles: { fillColor: false },
    columnStyles: {
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right" },
    },
    didParseCell: (data) => {
      if (data.section !== "body") return;
      const kind = rows[data.row.index]?.kind;
      if (kind === "po") {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [235, 235, 235];
      } else if (kind === "total" || kind === "grand") {
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  doc.save(`Pending-Payments-${stamp()}.pdf`);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
const poRowStyle = {
  background: "var(--color-plate2)",
  fontWeight: 600,
  cursor: "pointer",
};
const totalRowStyle = {
  fontWeight: 600,
  borderTop: "1px solid var(--color-line)",
};

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

  const visibleBills = useMemo(() => {
    if (!report) return [];
    return filterPendingRows(report.rows, {
      search,
      fromDate,
      toDate,
      paymentStatus,
      ageBucket,
    });
  }, [report, search, fromDate, toDate, paymentStatus, ageBucket]);

  const groups = useMemo(() => groupByPO(visibleBills), [visibleBills]);

  // Grand total follows the filters, so it always matches what is on screen.
  const grand = useMemo(
    () => ({ ...sumOf(visibleBills), billCount: visibleBills.length }),
    [visibleBills]
  );

  function handleExportExcel() {
    if (!report) return;
    exportToExcel(groups, grand);
  }

  async function handleExportPdf() {
    if (!report) return;
    setExportingPdf(true);
    try {
      await exportToPDF(groups, grand, group);
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
    search ||
    fromDate ||
    toDate ||
    paymentStatus !== "all" ||
    ageBucket !== "all" ||
    group !== "all";

  return (
    <div className="pending-page">
      <div className="pending-header">
        <TitleBlock
          docType="PENDING PAYMENTS"
          fields={[
            { label: "POs", value: report ? new Set(report.rows.map((r) => r.poId)).size : "—" },
            { label: "Generated", value: fmtToday() },
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
                <th className="text-right">Net Recv.</th>
                <th className="text-right">Paid</th>
                <th className="text-right">Balance</th>
                <th className="text-right">Days Due</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <Fragment key={g.poId}>
                  {/* 1. PO heading */}
                  <tr style={poRowStyle} onClick={() => navigate(`/po/${g.poId}`)}>
                    <td colSpan={COLS} className="text-rivet">
                      {poHeading(g)}
                    </td>
                  </tr>

                  {/* 2. Pending bills of this PO */}
                  {g.bills.map((b) => (
                    <tr
                      key={`${b.poId}-${b.billNo}-${b.billDate}`}
                      className="pending-row"
                      onClick={() => navigate(`/po/${b.poId}`)}
                    >
                      <td className="text-rivet">{b.billNo}</td>
                      <td>{fmtDate(b.billDate)}</td>
                      <td className="text-right tabular text-rivet2">
                        {fmtNum(b.netReceivable, 0)}
                      </td>
                      <td className="text-right tabular">
                        {fmtNum(b.paymentReceived, 0)}
                      </td>
                      <td className="text-right tabular text-warn">
                        {fmtNum(b.balanceToReceive, 0)}
                      </td>
                      <td
                        className={`text-right tabular pending-days ${ageClass(b.daysDue)}`}
                      >
                        {b.daysDue ?? "-"}
                      </td>
                    </tr>
                  ))}

                  {/* 3. Total for this PO */}
                  <tr style={totalRowStyle}>
                    <td>Total</td>
                    <td></td>
                    <td className="text-right tabular text-rivet2">
                      {fmtNum(g.total.netReceivable, 0)}
                    </td>
                    <td className="text-right tabular">
                      {fmtNum(g.total.paymentReceived, 0)}
                    </td>
                    <td className="text-right tabular text-warn">
                      {fmtNum(g.total.balanceToReceive, 0)}
                    </td>
                    <td></td>
                  </tr>
                </Fragment>
              ))}
            </tbody>

            {/* Grand total across every PO shown */}
            <tfoot>
              <tr>
                <td>Grand Total</td>
                <td></td>
                <td className="text-right tabular text-rivet2">
                  {fmtINR(grand.netReceivable)}
                </td>
                <td className="text-right tabular">{fmtINR(grand.paymentReceived)}</td>
                <td className="text-right tabular">{fmtINR(grand.balanceToReceive)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {!loading && report && groups.length === 0 && (
        <div className="empty-state" style={{ marginTop: "1.5rem" }}>
          {report.rows.length === 0
            ? "No pending payments — every bill is settled."
            : "No pending bills match your filters."}
        </div>
      )}
    </div>
  );
}