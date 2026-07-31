export function fmtNum(n, decimals = 0) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "-";
  return v.toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function fmtINR(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "-";
  return "\u20B9" + fmtNum(v, 0);
}

export function fmtDate(d) {
  if (!d) return "-";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function toInputDate(d) {
  if (!d) return "";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}
