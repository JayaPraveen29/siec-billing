// Shared formatting helpers.
// Numbers: Indian digit grouping (10,00,000) and always 2 decimals (12.05).
// Dates:   DD-MM-YY numeric (21-10-26).

export function fmtNum(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "-";
  return v.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function fmtINR(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "-";
  return (v < 0 ? "-" : "") + "\u20B9" + fmtNum(Math.abs(v));
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function dmy(date) {
  return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${String(date.getFullYear()).slice(-2)}`;
}

export function fmtDate(d) {
  if (!d) return "-";
  // Plain yyyy-mm-dd strings are formatted directly (no timezone shifting).
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d));
  if (m) return `${m[3]}-${m[2]}-${m[1].slice(-2)}`;
  const date = d && typeof d.toDate === "function" ? d.toDate() : new Date(d);
  if (Number.isNaN(date.getTime())) return "-";
  return dmy(date);
}

/** Today's date as DD-MM-YY (used for the "Generated" stamps). */
export function fmtToday() {
  return dmy(new Date());
}

/**
 * Company name printed on PDF reports.
 * A single group selected -> that group's name ("SIEC" / "ST");
 * otherwise (all groups) -> "SIEC GROUP".
 */
export function companyName(group) {
  return group && group !== "all" ? group : "SIEC GROUP";
}

export function toInputDate(d) {
  if (!d) return "";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

/** Print the company name at the top-left of a jsPDF page (above the title). */
export function drawPdfCompany(doc, company) {
  doc.setFont(undefined, "bold");
  doc.setFontSize(14);
  doc.text(companyName(company), 40, 24);
  doc.setFont(undefined, "normal");
}
