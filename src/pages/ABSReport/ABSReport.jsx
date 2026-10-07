import { useEffect, useMemo, useState } from "react";
import { RefreshCw, FileSpreadsheet, FileText } from "lucide-react";
import { fetchAllPOData } from "../../services/poService";
import { computeABSReport } from "../../utils/ledger";
import { fmtINR, fmtNum, fmtDate } from "../../utils/format";
import { exportABSReportToExcel, exportABSReportToPDF } from "../../utils/absExport";
import TitleBlock from "../../components/TitleBlock";
import Loading from "../../components/Loading";
import "./ABSReport.css";

// Options for the "Group" dropdown. Keep in sync with the PO create page.
const PO_GROUPS = ["SIEC", "ST"];

export default function ABSReport() {
  const [allData, setAllData] = useState(null);
  const [group, setGroup] = useState("all");
  const [loading, setLoading] = useState(true);
  const [exportingPdf, setExportingPdf] = useState(false);

  async function load() {
    setLoading(true);
    const all = await fetchAllPOData();
    setAllData(all);
    setLoading(false);
  }

  const report = useMemo(() => {
    if (!allData) return null;
    return computeABSReport(
      allData.filter((d) => group === "all" || d.po.group === group)
    );
  }, [allData, group]);

  useEffect(() => {
    load();
  }, []);

  function handleExportExcel() {
    if (!report) return;
    exportABSReportToExcel(report);
  }

  async function handleExportPdf() {
    if (!report) return;
    setExportingPdf(true);
    try {
      await exportABSReportToPDF(report);
    } finally {
      setExportingPdf(false);
    }
  }

  return (
    <div className="abs-page">
      <div className="abs-header">
        <TitleBlock
          docType="Abstract of Structural Bills"
          fields={[
            { label: "PO Groups", value: report ? report.groups.length : "—" },
            { label: "Generated", value: new Date().toLocaleDateString("en-GB") },
          ]}
        />
        <div className="abs-actions">
          <button
            onClick={handleExportExcel}
            className="abs-export-btn"
            disabled={!report || loading}
            title="Export to Excel"
          >
            <FileSpreadsheet size={15} />
            Excel
          </button>
          <button
            onClick={handleExportPdf}
            className="abs-export-btn"
            disabled={!report || loading || exportingPdf}
            title="Export to PDF"
          >
            <FileText size={15} className={exportingPdf ? "spinning" : ""} />
            PDF
          </button>
          <button onClick={load} className="abs-refresh">
            <RefreshCw size={15} className={loading ? "spinning" : ""} />
            Refresh
          </button>
        </div>
      </div>

      <div className="abs-controls">
        <select value={group} onChange={(e) => setGroup(e.target.value)}>
          <option value="all">Group</option>
          {PO_GROUPS.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </div>

      {loading && <Loading label="Compiling abstract" />}

      {!loading && report && (
        <div className="table-scroll abs-table-wrap">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>PO</th>
                <th>Inv. No.</th>
                <th>Date</th>
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
                <th className="text-right">Days</th>
              </tr>
            </thead>
            <tbody>
              {report.groups.map((g) => (
                <GroupRows key={g.po.id} group={g} />
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
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {!loading && report && report.groups.length === 0 && (
        <div className="empty-state" style={{ marginTop: "1.5rem" }}>
          {allData && allData.length === 0
            ? "No PO sheets to report on yet."
            : "No POs found for the selected group."}
        </div>
      )}
    </div>
  );
}

function GroupRows({ group }) {
  return (
    <>
      {group.rows.map((r, idx) => (
        <tr key={idx}>
          <td className="text-rivet">{idx === 0 ? group.po.code : ""}</td>
          <td>{r.invoiceNo}</td>
          <td>{fmtDate(r.invoiceDate)}</td>
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
          <td className={`text-right tabular ${r.balanceToReceive > 0.5 ? "text-warn" : "text-ok"}`}>
            {fmtNum(r.balanceToReceive, 0)}
          </td>
          <td className="text-right tabular text-muted">{r.days ?? "-"}</td>
        </tr>
      ))}
      <tr className="abs-subtotal-row">
        <td colSpan={3}>Subtotal — {group.po.code}</td>
        <td className="text-right tabular">{fmtNum(group.subtotal.qty, 1)}</td>
        <td className="text-right tabular">{fmtNum(group.subtotal.basic, 0)}</td>
        <td className="text-right tabular">{fmtNum(group.subtotal.gst, 0)}</td>
        <td className="text-right tabular">{fmtNum(group.subtotal.tds, 0)}</td>
        <td className="text-right tabular">{fmtNum(group.subtotal.roundOff, 2)}</td>
        <td className="text-right tabular">{fmtNum(group.subtotal.grossValue, 2)}</td>
        <td className="text-right tabular">{fmtNum(group.subtotal.matAdvance, 0)}</td>
        <td className="text-right tabular">{fmtNum(group.subtotal.netReceivable, 0)}</td>
        <td></td>
        <td className="text-right tabular">{fmtNum(group.subtotal.paymentReceived, 0)}</td>
        <td className="text-right tabular">{fmtNum(group.subtotal.balanceToReceive, 0)}</td>
        <td></td>
      </tr>
    </>
  );
}