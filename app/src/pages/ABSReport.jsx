import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { fetchAllPOData } from "../services/poService";
import { computeABSReport } from "../utils/ledger";
import { fmtINR, fmtNum, fmtDate } from "../utils/format";
import TitleBlock from "../components/TitleBlock";
import Loading from "../components/Loading";

export default function ABSReport() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const all = await fetchAllPOData();
    setReport(computeABSReport(all));
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <TitleBlock
          docType="Abstract of Structural Bills"
          fields={[
            { label: "PO Groups", value: report ? report.groups.length : "—" },
            { label: "Generated", value: new Date().toLocaleDateString("en-GB") },
          ]}
        />
        <button
          onClick={load}
          className="flex items-center gap-2 border border-line hover:border-rivet px-3 py-2 rounded-sm text-sm shrink-0 transition"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {loading && <Loading label="Compiling abstract" />}

      {!loading && report && (
        <div className="overflow-x-auto border border-line rounded-sm mt-6">
          <table className="w-full ledger-table text-sm">
            <thead className="bg-plate2">
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
                <th className="text-right">Payment</th>
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
              <tr className="bg-plate2 font-semibold border-t-2 border-rivet">
                <td colSpan={3}>Grand Total</td>
                <td className="text-right font-mono tabular">
                  {fmtNum(report.grandTotal.qty, 1)}
                </td>
                <td className="text-right font-mono tabular">
                  {fmtNum(report.grandTotal.basic, 0)}
                </td>
                <td className="text-right font-mono tabular">
                  {fmtNum(report.grandTotal.gst, 0)}
                </td>
                <td className="text-right font-mono tabular">
                  {fmtNum(report.grandTotal.tds, 0)}
                </td>
                <td className="text-right font-mono tabular">
                  {fmtNum(report.grandTotal.roundOff, 0)}
                </td>
                <td className="text-right font-mono tabular">
                  {fmtINR(report.grandTotal.grossValue)}
                </td>
                <td className="text-right font-mono tabular">
                  {fmtINR(report.grandTotal.matAdvance)}
                </td>
                <td className="text-right font-mono tabular text-rivet2">
                  {fmtINR(report.grandTotal.netReceivable)}
                </td>
                <td></td>
                <td className="text-right font-mono tabular">
                  {fmtINR(report.grandTotal.paymentReceived)}
                </td>
                <td className="text-right font-mono tabular">
                  {fmtINR(report.grandTotal.balanceToReceive)}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {!loading && report && report.groups.length === 0 && (
        <div className="border border-dashed border-line rounded-sm py-14 text-center text-muted mt-6">
          No PO sheets to report on yet.
        </div>
      )}
    </div>
  );
}

function GroupRows({ group }) {
  return (
    <>
      {group.rows.map((r, idx) => (
        <tr key={idx} className="hover:bg-plate2/60">
          <td className="font-mono text-rivet">{idx === 0 ? group.po.code : ""}</td>
          <td className="font-mono">{r.invoiceNo}</td>
          <td className="font-mono">{fmtDate(r.invoiceDate)}</td>
          <td className="text-right font-mono tabular">{fmtNum(r.qty, 1)}</td>
          <td className="text-right font-mono tabular">{fmtNum(r.basic, 0)}</td>
          <td className="text-right font-mono tabular">{fmtNum(r.gst, 0)}</td>
          <td className="text-right font-mono tabular">{fmtNum(r.tds, 0)}</td>
          <td className="text-right font-mono tabular">{fmtNum(r.roundOff, 0)}</td>
          <td className="text-right font-mono tabular font-semibold">
            {fmtNum(r.grossValue, 0)}
          </td>
          <td className="text-right font-mono tabular">{fmtNum(r.matAdvance, 0)}</td>
          <td className="text-right font-mono tabular text-rivet2">
            {fmtNum(r.netReceivable, 0)}
          </td>
          <td className="font-mono">{fmtDate(r.paymentDate)}</td>
          <td className="text-right font-mono tabular">
            {fmtNum(r.paymentReceived, 0)}
          </td>
          <td
            className={`text-right font-mono tabular ${
              r.balanceToReceive > 0.5 ? "text-warn" : "text-ok"
            }`}
          >
            {fmtNum(r.balanceToReceive, 0)}
          </td>
          <td className="text-right font-mono tabular text-muted">{r.days ?? "-"}</td>
        </tr>
      ))}
      <tr className="bg-plate/60 text-xs text-muted italic">
        <td colSpan={3}>Subtotal — {group.po.code}</td>
        <td className="text-right font-mono tabular">{fmtNum(group.subtotal.qty, 1)}</td>
        <td className="text-right font-mono tabular">{fmtNum(group.subtotal.basic, 0)}</td>
        <td className="text-right font-mono tabular">{fmtNum(group.subtotal.gst, 0)}</td>
        <td className="text-right font-mono tabular">{fmtNum(group.subtotal.tds, 0)}</td>
        <td className="text-right font-mono tabular">
          {fmtNum(group.subtotal.roundOff, 0)}
        </td>
        <td className="text-right font-mono tabular">
          {fmtNum(group.subtotal.grossValue, 0)}
        </td>
        <td className="text-right font-mono tabular">
          {fmtNum(group.subtotal.matAdvance, 0)}
        </td>
        <td className="text-right font-mono tabular">
          {fmtNum(group.subtotal.netReceivable, 0)}
        </td>
        <td></td>
        <td className="text-right font-mono tabular">
          {fmtNum(group.subtotal.paymentReceived, 0)}
        </td>
        <td className="text-right font-mono tabular">
          {fmtNum(group.subtotal.balanceToReceive, 0)}
        </td>
        <td></td>
      </tr>
    </>
  );
}
