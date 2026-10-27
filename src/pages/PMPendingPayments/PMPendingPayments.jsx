import { Fragment, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, RefreshCw, FileSpreadsheet, FileText, Search } from "lucide-react";
import * as XLSX from "xlsx";
import { fetchAllPOData } from "../../services/poService";
import {
  computePendingPaymentsReport,
  filterPendingRows,
  ageClass,
  AGE_BUCKETS,
} from "../../utils/pendingPaymentsReport";
import { fmtNum, fmtDate, fmtToday, drawPdfCompany } from "../../utils/format";
import GroupSelect, { WorkTypeSelect } from "../../components/GroupSelect";
import { matchesGroup, matchesWorkType } from "../../utils/groups";
import { companyName } from "../../utils/format";
import TitleBlock from "../../components/TitleBlock";
import Loading from "../../components/Loading";
import "./PMPendingPayments.css";


const PAYMENT_FILTERS = [
  { value: "all", label: "All Pending" },
  { value: "unpaid", label: "Unpaid" },
  { value: "partially-paid", label: "Partially Paid" },
];

const COLS = 6;
const NO_PM = "__none";

const pmLabel = (pm) => pm || "Not Assigned";
const unitLabel = (u) => u || "Unassigned";
const poHeading = (g) => `PO: ${g.poCode}  |  Unit: ${unitLabel(g.unit)}`;

// ---------------------------------------------------------------------------
// Grouping: PM -> PO -> pending bills.  Every level carries its totals.
// ---------------------------------------------------------------------------
const emptySum = () => ({
  netReceivable: 0,
  paymentReceived: 0,
  balanceToReceive: 0,
  age30: 0, // balance outstanding 0 - 30 days
  age45: 0, // 31 - 45 days
  age46: 0, // 46 days & above
});

function addBill(acc, b) {
  acc.netReceivable += b.netReceivable;
  acc.paymentReceived += b.paymentReceived;
  acc.balanceToReceive += b.balanceToReceive;
  const d = b.daysDue ?? 0;
  if (d >= 46) acc.age46 += b.balanceToReceive;
  else if (d >= 31) acc.age45 += b.balanceToReceive;
  else acc.age30 += b.balanceToReceive;
  return acc;
}

function groupByPM(bills) {
  const pmMap = new Map();
  bills.forEach((b) => {
    const pmKey = (b.projectManager || "").trim();
    if (!pmMap.has(pmKey)) pmMap.set(pmKey, { pm: pmKey, poMap: new Map(), bills: [] });
    const pm = pmMap.get(pmKey);
    pm.bills.push(b);
    if (!pm.poMap.has(b.poId))
      pm.poMap.set(b.poId, { poId: b.poId, poCode: b.poCode, unit: b.unit || "", bills: [] });
    pm.poMap.get(b.poId).bills.push(b);
  });

  const byAge = (a, b) => (b.daysDue ?? -1) - (a.daysDue ?? -1);

  const pms = [...pmMap.values()].map((pm) => {
    const pos = [...pm.poMap.values()].map((po) => {
      po.bills.sort(byAge);
      return {
        ...po,
        total: po.bills.reduce(addBill, emptySum()),
        maxDaysDue: po.bills[0]?.daysDue ?? null,
      };
    });
    pos.sort((a, b) => (b.maxDaysDue ?? -1) - (a.maxDaysDue ?? -1));
    pm.bills.sort(byAge);
    return {
      pm: pm.pm,
      pos,
      billCount: pm.bills.length,
      maxDaysDue: pm.bills[0]?.daysDue ?? null,
      total: pm.bills.reduce(addBill, emptySum()),
    };
  });

  // Alphabetical, "Not Assigned" last.
  pms.sort((a, b) => {
    if (!a.pm !== !b.pm) return a.pm ? -1 : 1;
    return a.pm.localeCompare(b.pm, undefined, { sensitivity: "base" });
  });
  return pms;
}

// ---------------------------------------------------------------------------
// Exports (kept in this file so only one file needs to change)
// ---------------------------------------------------------------------------
const SUMMARY_HEADERS = [
  "Project Manager",
  "POs",
  "Bills",
  "Net Recv.",
  "Paid",
  "Balance",
  "0–30 days",
  "31–45 days",
  "46 & above",
  "Oldest (days)",
];

const DETAIL_HEADERS = ["Bill No.", "Bill Date", "Net Recv.", "Paid", "Balance", "Days Due"];

function summaryRows(pms, grand) {
  const rows = pms.map((p) => [
    pmLabel(p.pm),
    p.pos.length,
    p.billCount,
    fmtNum(p.total.netReceivable, 0),
    fmtNum(p.total.paymentReceived, 0),
    fmtNum(p.total.balanceToReceive, 0),
    fmtNum(p.total.age30, 0),
    fmtNum(p.total.age45, 0),
    fmtNum(p.total.age46, 0),
    p.maxDaysDue ?? "",
  ]);
  rows.push([
    "Grand Total",
    pms.reduce((n, p) => n + p.pos.length, 0),
    grand.billCount,
    fmtNum(grand.netReceivable, 0),
    fmtNum(grand.paymentReceived, 0),
    fmtNum(grand.balanceToReceive, 0),
    fmtNum(grand.age30, 0),
    fmtNum(grand.age45, 0),
    fmtNum(grand.age46, 0),
    "",
  ]);
  return rows;
}

// Detail rows tagged by kind: "pm" | "po" | "bill" | "total" | "pmTotal" | "grand".
function detailRows(pms, grand) {
  const out = [];
  const empty = ["", "", "", "", ""];
  pms.forEach((p) => {
    out.push({ kind: "pm", cells: [`PM: ${pmLabel(p.pm)}`, ...empty] });
    p.pos.forEach((g) => {
      out.push({ kind: "po", cells: [poHeading(g), ...empty] });
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
      kind: "pmTotal",
      cells: [
        `Total — ${pmLabel(p.pm)}`,
        "",
        fmtNum(p.total.netReceivable, 0),
        fmtNum(p.total.paymentReceived, 0),
        fmtNum(p.total.balanceToReceive, 0),
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

function exportToExcel(pms, grand) {
  const wb = XLSX.utils.book_new();

  const ws1 = XLSX.utils.aoa_to_sheet([SUMMARY_HEADERS, ...summaryRows(pms, grand)]);
  ws1["!cols"] = [
    { wch: 24 }, { wch: 6 }, { wch: 7 }, { wch: 13 }, { wch: 12 },
    { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 13 },
  ];
  XLSX.utils.book_append_sheet(wb, ws1, "PM Summary");

  const ws2 = XLSX.utils.aoa_to_sheet([
    DETAIL_HEADERS,
    ...detailRows(pms, grand).map((r) => r.cells),
  ]);
  ws2["!cols"] = [{ wch: 28 }, { wch: 14 }, { wch: 13 }, { wch: 12 }, { wch: 12 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, ws2, "PM Detail");

  XLSX.writeFile(wb, `PM-Pending-Payments-${stamp()}.xlsx`);
}

async function exportToPDF(pms, grand, company) {
  const { default: jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  drawPdfCompany(doc, company);
  doc.setFontSize(11);
  doc.setFont(undefined, "normal");
  doc.text("PM Wise Pending Payments Report", 40, 40);
  doc.setFontSize(9);
  doc.text(`Project Managers: ${pms.length}`, 40, 58);

  const base = {
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
  };

  // 1. Summary: one line per PM
  const sum = summaryRows(pms, grand);
  autoTable(doc, {
    ...base,
    head: [SUMMARY_HEADERS],
    body: sum.map((r) => r.map((v) => String(v))),
    startY: 72,
    columnStyles: Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => [i, { halign: "right" }])),
    didParseCell: (d) => {
      if (d.section === "body" && d.row.index === sum.length - 1)
        d.cell.styles.fontStyle = "bold";
    },
  });

  // 2. Detail: PM -> PO -> bills
  const rows = detailRows(pms, grand);
  doc.addPage();
  autoTable(doc, {
    ...base,
    head: [DETAIL_HEADERS],
    body: rows.map((r) => r.cells.map((v) => String(v))),
    startY: 40,
    columnStyles: Object.fromEntries([2, 3, 4, 5].map((i) => [i, { halign: "right" }])),
    didParseCell: (data) => {
      if (data.section !== "body") return;
      const kind = rows[data.row.index]?.kind;
      if (kind === "pm") {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [210, 210, 210];
      } else if (kind === "po") {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [235, 235, 235];
      } else if (kind === "total" || kind === "pmTotal" || kind === "grand") {
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  doc.save(`PM-Pending-Payments-${stamp()}.pdf`);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function PMPendingPayments() {
  const navigate = useNavigate();
  const [allData, setAllData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exportingPdf, setExportingPdf] = useState(false);

  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("all");
  const [workType, setWorkType] = useState("all");
  // The selected PM lives in the URL (?pm=...) so that opening a PO and coming
  // back with the browser's back button returns to the same PM view.
  const [searchParams, setSearchParams] = useSearchParams();
  const pmFilter = searchParams.get("pm") || "all";
  function setPmFilter(value) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value === "all") next.delete("pm");
        else next.set("pm", value);
        return next;
      },
      { replace: false }
    );
  }
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

  // Initial load. `loading` already starts as true, so no synchronous
  // setState is needed here; state is only set once the data arrives.
  useEffect(() => {
    let cancelled = false;
    fetchAllPOData()
      .then((all) => {
        if (cancelled) return;
        setAllData(all);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const report = useMemo(() => {
    if (!allData) return null;
    return computePendingPaymentsReport(
      allData.filter((d) => matchesGroup(d.po.group, group) && matchesWorkType(d.po.workType, workType))
    );
  }, [allData, group, workType]);

  // Project Managers present in the report (for the dropdown).
  const pmOptions = useMemo(() => {
    const set = new Set();
    let hasNone = false;
    (report?.rows || []).forEach((r) => {
      const v = (r.projectManager || "").trim();
      if (v) set.add(v);
      else hasNone = true;
    });
    return {
      names: [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
      hasNone,
    };
  }, [report]);

  const visibleBills = useMemo(() => {
    if (!report) return [];
    const pmRows =
      pmFilter === "all"
        ? report.rows
        : report.rows.filter(
            (r) => (r.projectManager || "").trim() === (pmFilter === NO_PM ? "" : pmFilter)
          );
    return filterPendingRows(pmRows, { search, fromDate, toDate, paymentStatus, ageBucket });
  }, [report, pmFilter, search, fromDate, toDate, paymentStatus, ageBucket]);

  const pms = useMemo(() => groupByPM(visibleBills), [visibleBills]);

  // Grand total follows the filters, so it always matches what is on screen.
  const grand = useMemo(
    () => ({ ...visibleBills.reduce(addBill, emptySum()), billCount: visibleBills.length }),
    [visibleBills]
  );

  function handleExportExcel() {
    if (!report) return;
    exportToExcel(pms, grand);
  }

  async function handleExportPdf() {
    if (!report) return;
    setExportingPdf(true);
    try {
      await exportToPDF(pms, grand, group);
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
    setWorkType("all");
    setPmFilter("all");
  }

  const hasFilters =
    search ||
    fromDate ||
    toDate ||
    paymentStatus !== "all" ||
    ageBucket !== "all" ||
    group !== "all" || workType !== "all" ||
    pmFilter !== "all";

  const poCount = pms.reduce((n, p) => n + p.pos.length, 0);

  return (
    <div className="pmp-page">
      <div className="pmp-header">
        <TitleBlock
          company={companyName(group)}
          docType="PM WISE PENDING PAYMENTS"
          fields={[
            { label: "PMs", value: report ? pms.length : "—" },
            { label: "POs", value: report ? poCount : "—" },
            { label: "Generated", value: fmtToday() },
          ]}
        />
        <div className="pmp-actions">
          <button
            onClick={handleExportExcel}
            className="pmp-btn"
            disabled={!report || loading}
            title="Export to Excel"
          >
            <FileSpreadsheet size={15} />
            Excel
          </button>
          <button
            onClick={handleExportPdf}
            className="pmp-btn"
            disabled={!report || loading || exportingPdf}
            title="Export to PDF"
          >
            <FileText size={15} className={exportingPdf ? "spinning" : ""} />
            PDF
          </button>
          <button onClick={load} className="pmp-btn">
            <RefreshCw size={15} className={loading ? "spinning" : ""} />
            Refresh
          </button>
        </div>
      </div>

      <div className="pmp-controls">
        <div className="pmp-search">
          <Search size={15} className="text-muted" />
          <input
            type="text"
            placeholder="Search bill no., PO or PM…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="pmp-date-range">
          <label>
            From
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </label>
          <label>
            To
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </label>
        </div>
        <select value={pmFilter} onChange={(e) => setPmFilter(e.target.value)}>
          <option value="all">Project Manager</option>
          {pmOptions.names.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
          {pmOptions.hasNone && <option value={NO_PM}>Not Assigned</option>}
        </select>
        <GroupSelect value={group} onChange={setGroup} />
<WorkTypeSelect value={workType} onChange={setWorkType} />
        <select value={ageBucket} onChange={(e) => setAgeBucket(e.target.value)}>
          {AGE_BUCKETS.map((b) => (
            <option key={b.value} value={b.value}>
              {b.label}
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
        {hasFilters && (
          <button type="button" className="pmp-clear" onClick={clearFilters}>
            Clear filters
          </button>
        )}
      </div>

      {loading && <Loading label="Compiling report" />}

      {/* Back to the PM list - sits right above the tables */}
      {!loading && report && pmFilter !== "all" && (
        <div className="pmp-backbar">
          <button
            type="button"
            className="pmp-btn"
            onClick={() => setPmFilter("all")}
            title="Back to the PM wise pending payments summary"
          >
            <ArrowLeft size={15} />
            Back to PM Wise Pending Payments
          </button>
          <span className="pmp-backbar-pm">
            {pmFilter === NO_PM ? "Not Assigned" : pmFilter}
          </span>
        </div>
      )}

      {/* ---- 1. Summary: one line per Project Manager ---- */}
      {!loading && report && pms.length > 0 && (
        <div className="table-scroll pmp-table-wrap">
          <table className="ledger-table pmp-table">
            <thead>
              <tr>
                <th>Project Manager</th>
                <th className="text-right">POs</th>
                <th className="text-right">Bills</th>
                <th className="text-right">Net Recv.</th>
                <th className="text-right">Paid</th>
                <th className="text-right">Balance</th>
                <th className="text-right">0–30 days</th>
                <th className="text-right">31–45 days</th>
                <th className="text-right">46 &amp; above</th>
                <th className="text-right">Oldest (days)</th>
              </tr>
            </thead>
            <tbody>
              {pms.map((p) => (
                <tr
                  key={p.pm || NO_PM}
                  className="pmp-row"
                  onClick={() => setPmFilter(p.pm || NO_PM)}
                  title="Click to show only this Project Manager"
                >
                  <td className="text-rivet">{pmLabel(p.pm)}</td>
                  <td className="text-right tabular">{p.pos.length}</td>
                  <td className="text-right tabular">{p.billCount}</td>
                  <td className="text-right tabular text-rivet2">
                    {fmtNum(p.total.netReceivable, 0)}
                  </td>
                  <td className="text-right tabular">{fmtNum(p.total.paymentReceived, 0)}</td>
                  <td className="text-right tabular text-warn">
                    {fmtNum(p.total.balanceToReceive, 0)}
                  </td>
                  <td className="text-right tabular">{fmtNum(p.total.age30, 0)}</td>
                  <td className="text-right tabular">{fmtNum(p.total.age45, 0)}</td>
                  <td className="text-right tabular">{fmtNum(p.total.age46, 0)}</td>
                  <td className={`text-right tabular pmp-days ${ageClass(p.maxDaysDue)}`}>
                    {p.maxDaysDue ?? "-"}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Grand Total</td>
                <td className="text-right tabular">{poCount}</td>
                <td className="text-right tabular">{grand.billCount}</td>
                <td className="text-right tabular text-rivet2">
                  {fmtNum(grand.netReceivable, 0)}
                </td>
                <td className="text-right tabular">{fmtNum(grand.paymentReceived, 0)}</td>
                <td className="text-right tabular text-warn">
                  {fmtNum(grand.balanceToReceive, 0)}
                </td>
                <td className="text-right tabular">{fmtNum(grand.age30, 0)}</td>
                <td className="text-right tabular">{fmtNum(grand.age45, 0)}</td>
                <td className="text-right tabular">{fmtNum(grand.age46, 0)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* ---- 2. Detail: PM -> PO -> pending bills ---- */}
      {!loading && report && pms.length > 0 && (
        <div className="table-scroll pmp-table-wrap">
          <table className="ledger-table pmp-table pmp-table-detail">
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
              {pms.map((p) => (
                <Fragment key={p.pm || NO_PM}>
                  <tr className="pmp-pm-row">
                    <td colSpan={COLS} className="text-rivet">
                      PM: {pmLabel(p.pm)}
                    </td>
                  </tr>

                  {p.pos.map((g) => (
                    <Fragment key={g.poId}>
                      <tr className="pmp-po-row" onClick={() => navigate(`/po/${g.poId}`)}>
                        <td colSpan={COLS} className="text-rivet">
                          {poHeading(g)}
                        </td>
                      </tr>

                      {g.bills.map((b) => (
                        <tr
                          key={`${b.poId}-${b.billNo}-${b.billDate}`}
                          className="pmp-row"
                          onClick={() => navigate(`/po/${b.poId}`)}
                        >
                          <td className="text-rivet">{b.billNo}</td>
                          <td>{fmtDate(b.billDate)}</td>
                          <td className="text-right tabular text-rivet2">
                            {fmtNum(b.netReceivable, 0)}
                          </td>
                          <td className="text-right tabular">{fmtNum(b.paymentReceived, 0)}</td>
                          <td className="text-right tabular text-warn">
                            {fmtNum(b.balanceToReceive, 0)}
                          </td>
                          <td
                            className={`text-right tabular pmp-days ${ageClass(b.daysDue)}`}
                          >
                            {b.daysDue ?? "-"}
                          </td>
                        </tr>
                      ))}

                      <tr className="pmp-total-row">
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

                  <tr className="pmp-total-row">
                    <td>Total — {pmLabel(p.pm)}</td>
                    <td></td>
                    <td className="text-right tabular text-rivet2">
                      {fmtNum(p.total.netReceivable, 0)}
                    </td>
                    <td className="text-right tabular">{fmtNum(p.total.paymentReceived, 0)}</td>
                    <td className="text-right tabular text-warn">
                      {fmtNum(p.total.balanceToReceive, 0)}
                    </td>
                    <td></td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Grand Total</td>
                <td></td>
                <td className="text-right tabular text-rivet2">
                  {fmtNum(grand.netReceivable, 0)}
                </td>
                <td className="text-right tabular">{fmtNum(grand.paymentReceived, 0)}</td>
                <td className="text-right tabular text-warn">
                  {fmtNum(grand.balanceToReceive, 0)}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {!loading && report && pms.length === 0 && (
        <div className="empty-state" style={{ marginTop: "1.5rem" }}>
          {report.rows.length === 0
            ? "No pending payments — every bill is settled."
            : "No pending bills match your filters."}
        </div>
      )}
    </div>
  );
}