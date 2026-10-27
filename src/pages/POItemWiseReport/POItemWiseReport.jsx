import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { RefreshCw, FileSpreadsheet, FileText, Search, ExternalLink } from "lucide-react";
import { fetchAllPOData } from "../../services/poService";
import {
  computePOItemWiseReport,
  filterPOItemWiseGroups,
  listItemNames,
  ITEM_STATUS_LABELS,
} from "../../utils/poItemWiseReport";
import { fmtNum, fmtINR, fmtDate , fmtToday } from "../../utils/format";
import {
  exportPOItemWiseToExcel,
  exportPOItemWiseToPDF,
} from "../../utils/poItemWiseExport";
import GroupSelect, { WorkTypeSelect } from "../../components/GroupSelect";
import { matchesGroup, matchesWorkType } from "../../utils/groups";
import { companyName } from "../../utils/format";
import TitleBlock from "../../components/TitleBlock";
import Loading from "../../components/Loading";
import "../POWiseReport/POWiseReport.css"; // shared controls / badge styles
import "./POItemWiseReport.css";


const STATUS_FILTERS = [
  { value: "all", label: "All Item Status" },
  { value: "fully-billed", label: "Fully Billed" },
  { value: "in-progress", label: "In Progress" },
  { value: "not-started", label: "Not Started" },
  { value: "over-billed", label: "Over Billed" },
];

export default function POItemWiseReport() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [allData, setAllData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exportingPdf, setExportingPdf] = useState(false);

  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("all");
  const [workType, setWorkType] = useState("all");
  // ?po=<id> lets the PO Wise Report link straight to one PO.
  const [poId, setPoId] = useState(searchParams.get("po") || "all");
  const [itemKey, setItemKey] = useState("all");
  const [status, setStatus] = useState("all");
  const [pendingOnly, setPendingOnly] = useState(false);

  async function load() {
    setLoading(true);
    setAllData(await fetchAllPOData());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const allGroups = useMemo(
    () => (allData ? computePOItemWiseReport(allData) : []),
    [allData]
  );

  // POs available in the PO dropdown (respects the Group filter).
  const poOptions = useMemo(
    () => allGroups.filter((g) => matchesGroup(g.group, group) && matchesWorkType(g.workType, workType)),
    [allGroups, group, workType]
  );

  // Items available in the Item dropdown (respects Group + PO).
  const itemOptions = useMemo(
    () => listItemNames(poOptions.filter((g) => poId === "all" || g.poId === poId)),
    [poOptions, poId]
  );

  const report = useMemo(
    () =>
      filterPOItemWiseGroups(poOptions, { poId, itemKey, status, search, pendingOnly }),
    [poOptions, poId, itemKey, status, search, pendingOnly]
  );

  function onGroupChange(v) {
    setGroup(v);
    setPoId("all");
    setItemKey("all");
  }
  function onWorkTypeChange(v) {
    setWorkType(v);
    setPoId("all");
    setItemKey("all");
  }
  function onPoChange(v) {
    setPoId(v);
    setItemKey("all");
  }

  const itemCount = report.groups.reduce((s, g) => s + g.rows.length, 0);

  async function handleExportPdf() {
    setExportingPdf(true);
    try {
      await exportPOItemWiseToPDF(report, { company: group });
    } finally {
      setExportingPdf(false);
    }
  }

  return (
    <div className="poitem-page">
      <div className="powise-header">
        <TitleBlock
          company={companyName(group)}
          docType="PO ITEM WISE REPORT"
          fields={[
            { label: "POs", value: loading ? "—" : report.groups.length },
            { label: "Items", value: loading ? "—" : itemCount },
            { label: "Generated", value: fmtToday() },
          ]}
        />
        <div className="powise-actions">
          <button
            onClick={() => exportPOItemWiseToExcel(report)}
            className="powise-export-btn"
            disabled={loading || itemCount === 0}
          >
            <FileSpreadsheet size={15} /> Excel
          </button>
          <button
            onClick={handleExportPdf}
            className="powise-export-btn"
            disabled={loading || itemCount === 0 || exportingPdf}
          >
            <FileText size={15} className={exportingPdf ? "spinning" : ""} /> PDF
          </button>
          <button onClick={load} className="powise-refresh">
            <RefreshCw size={15} className={loading ? "spinning" : ""} /> Refresh
          </button>
        </div>
      </div>

      <div className="powise-controls">
        <div className="powise-search">
          <Search size={15} className="text-muted" />
          <input
            type="text"
            placeholder="Search item description or Sr No…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <GroupSelect value={group} onChange={onGroupChange} />
<WorkTypeSelect value={workType} onChange={onWorkTypeChange} />
        <select value={poId} onChange={(e) => onPoChange(e.target.value)}>
          <option value="all">All POs</option>
          {poOptions.map((g) => (
            <option key={g.poId} value={g.poId}>
              {g.poCode}
              {g.poNumber ? ` — ${g.poNumber}` : ""}
            </option>
          ))}
        </select>
        <select value={itemKey} onChange={(e) => setItemKey(e.target.value)}>
          <option value="all">All Items</option>
          {itemOptions.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUS_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <label className="poitem-check">
          <input
            type="checkbox"
            checked={pendingOnly}
            onChange={(e) => setPendingOnly(e.target.checked)}
          />
          Pending only
        </label>
      </div>

      {loading && <Loading label="Compiling report" />}

      {!loading && itemCount > 0 && (
        <div className="poitem-summary">
          <Stat label="Ordered (kg)" value={fmtNum(report.grandTotal.ordered, 1)} />
          <Stat label="Billed (kg)" value={fmtNum(report.grandTotal.billed, 1)} />
          <Stat
            label="Balance (kg)"
            value={fmtNum(report.grandTotal.balance, 1)}
            cls={report.grandTotal.balance > 0.01 ? "text-warn" : "text-ok"}
          />
          <Stat label="% Billed" value={`${fmtNum(report.grandTotal.pctBilled, 1)}%`} />
          <Stat label="Billed Value (basic)" value={fmtINR(report.grandTotal.value)} />
        </div>
      )}

      {!loading &&
        report.groups.map((g) => (
          <section key={g.poId} className="poitem-block">
            <div className="poitem-block-head">
              <div>
                <span className="text-rivet poitem-po-code">{g.poCode}</span>
                {g.poNumber && <span className="text-muted"> · PO No. {g.poNumber}</span>}
                <span className="text-muted"> · Rate ₹{fmtNum(g.unitRate, 2)}/kg</span>
              </div>
              <button className="poitem-open" onClick={() => navigate(`/po/${g.poId}`)}>
                Open PO <ExternalLink size={13} />
              </button>
            </div>

            <div className="table-scroll">
              <table className="ledger-table poitem-table">
                <thead>
                  <tr>
                    <th>Sr</th>
                    <th>Item Description</th>
                    <th className="text-right">Ordered (kg)</th>
                    {g.invoiceCols.map((c) => (
                      <th key={c.id} className="text-right poitem-inv-col">
                        <div>{c.invoiceNo}</div>
                        <div className="poitem-inv-date">{fmtDate(c.invoiceDate)}</div>
                      </th>
                    ))}
                    <th className="text-right">Billed (kg)</th>
                    <th className="text-right">Balance (kg)</th>
                    <th className="text-right">% Billed</th>
                    <th className="text-right">Value (₹)</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((r) => (
                    <tr key={r.itemId}>
                      <td className="tabular">{r.srNo}</td>
                      <td>{r.description}</td>
                      <td className="text-right tabular">{fmtNum(r.ordered, 1)}</td>
                      {g.invoiceCols.map((c) => (
                        <td key={c.id} className="text-right tabular">
                          {r.perInvoice[c.id] ? fmtNum(r.perInvoice[c.id], 1) : "–"}
                        </td>
                      ))}
                      <td className="text-right tabular" style={{ fontWeight: 600 }}>
                        {fmtNum(r.billed, 1)}
                      </td>
                      <td
                        className={`text-right tabular ${
                          r.balance < -0.01 ? "text-warn" : r.balance > 0.01 ? "" : "text-ok"
                        }`}
                      >
                        {fmtNum(r.balance, 1)}
                      </td>
                      <td className="text-right tabular">
                        <div className="poitem-bar" title={`${fmtNum(r.pctBilled, 0)}%`}>
                          <div
                            className="poitem-bar-fill"
                            style={{ width: `${Math.min(100, r.pctBilled)}%` }}
                          />
                        </div>
                        {fmtNum(r.pctBilled, 0)}%
                      </td>
                      <td className="text-right tabular">{fmtNum(r.value, 0)}</td>
                      <td>
                        <span className={`powise-badge item-${r.status}`}>
                          {ITEM_STATUS_LABELS[r.status]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td></td>
                    <td>PO Total</td>
                    <td className="text-right tabular">{fmtNum(g.subtotal.ordered, 1)}</td>
                    {g.invoiceCols.map((c) => (
                      <td key={c.id} className="text-right tabular">
                        {fmtNum(g.subtotal.perInvoice[c.id] || 0, 1)}
                      </td>
                    ))}
                    <td className="text-right tabular">{fmtNum(g.subtotal.billed, 1)}</td>
                    <td className="text-right tabular">{fmtNum(g.subtotal.balance, 1)}</td>
                    <td className="text-right tabular">{fmtNum(g.subtotal.pctBilled, 0)}%</td>
                    <td className="text-right tabular">{fmtNum(g.subtotal.value, 0)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        ))}

      {!loading && itemCount === 0 && (
        <div className="empty-state" style={{ marginTop: "1.5rem" }}>
          {allGroups.length === 0
            ? "No PO sheets to report on yet."
            : "No items match your filters."}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, cls = "" }) {
  return (
    <div className="poitem-stat">
      <div className="poitem-stat-label">{label}</div>
      <div className={`poitem-stat-value tabular ${cls}`}>{value}</div>
    </div>
  );
}
