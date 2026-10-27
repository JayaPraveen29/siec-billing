// Indian financial year helpers: 1 April -> 31 March.
// FY is identified by its starting calendar year (2025 = "2025-26").

function toDate(d) {
  if (!d) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d));
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const date = typeof d.toDate === "function" ? d.toDate() : new Date(d);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Starting year of the FY a date falls in (null if no valid date). */
export function fyStartYear(d) {
  const date = toDate(d);
  if (!date) return null;
  return date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
}

export const fyLabel = (startYear) => `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;

/** Does a date fall inside the selected FY filter ("all" or a start year)? */
export function inFinancialYear(d, selected) {
  if (!selected || selected === "all") return true;
  return fyStartYear(d) === Number(selected);
}

/** Distinct FY start years found in the invoices, newest first. */
export function listFinancialYears(poSheets) {
  const set = new Set();
  (poSheets || []).forEach(({ invoices }) =>
    (invoices || []).forEach((inv) => {
      const y = fyStartYear(inv.invoiceDate);
      if (y !== null) set.add(y);
    })
  );
  return [...set].sort((a, b) => b - a);
}
