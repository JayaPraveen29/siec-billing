import { useRef } from "react";

// Text input that shows what you type with Indian digit grouping
// (1,00,000.50) while keeping the underlying value a plain numeric string.
//   value     : raw numeric string/number (no commas), e.g. "100000.5"
//   onChange  : (raw) => void   - raw string without commas
//   onBlur    : (raw) => void   - raw string without commas
//   allowNA   : also accept the text "NA" (passed to onChange/onBlur as "NA")
// All other props (className, title, autoFocus, onKeyDown, placeholder...)
// are passed through to the <input>.

const clean = (s) => {
  const str = String(s ?? "").replace(/[^0-9.-]/g, "");
  const neg = str.startsWith("-");
  const body = str.replace(/-/g, "");
  const [intPart, ...rest] = body.split(".");
  const dec = rest.join("");
  const out = rest.length ? `${intPart}.${dec}` : intPart;
  return (neg ? "-" : "") + out;
};

export function groupIndian(raw) {
  const s = clean(raw);
  if (s === "" || s === "-") return s;
  const neg = s.startsWith("-");
  const body = neg ? s.slice(1) : s;
  const [intPart, dec] = body.split(".");
  const grouped = intPart
    ? Number(intPart.replace(/^0+(?=\d)/, "")).toLocaleString("en-IN", {
        maximumFractionDigits: 0,
      })
    : "";
  const shown = intPart.length > 15 ? intPart : grouped; // avoid precision loss
  return (neg ? "-" : "") + shown + (dec !== undefined ? "." + dec : "");
}

export default function IndianNumberInput({
  value,
  onChange,
  onBlur,
  maxDecimals = 2,
  allowNA = false, // let the user type the text "NA" instead of a number
  ...rest
}) {
  const ref = useRef(null);

  const isText = allowNA && /^[A-Za-z]/.test(String(value ?? ""));

  function handleChange(e) {
    const el = e.target;
    if (allowNA && /[A-Za-z]/.test(el.value)) {
      // Alphabetical entry: only "NA" is meaningful, keep up to 2 letters.
      onChange?.(el.value.replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 2));
      return;
    }
    const caret = el.selectionStart ?? el.value.length;
    // Count significant characters (digits, dot, minus) before the caret.
    const sig = el.value.slice(0, caret).replace(/[^0-9.-]/g, "").length;

    let raw = clean(el.value);
    if (maxDecimals >= 0 && raw.includes(".")) {
      const [i, d] = raw.split(".");
      raw = `${i}.${d.slice(0, maxDecimals)}`;
    }
    onChange?.(raw);

    // Restore the caret after React re-renders with the grouped text.
    requestAnimationFrame(() => {
      const node = ref.current;
      if (!node) return;
      const text = node.value;
      let seen = 0;
      let pos = text.length;
      for (let i = 0; i < text.length; i++) {
        if (seen === sig) {
          pos = i;
          break;
        }
        if (/[0-9.-]/.test(text[i])) seen++;
      }
      if (seen < sig) pos = text.length;
      try {
        node.setSelectionRange(pos, pos);
      } catch {
        /* ignore */
      }
    });
  }

  return (
    <input
      {...rest}
      ref={ref}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={isText ? String(value).toUpperCase() : groupIndian(value)}
      onChange={handleChange}
      onBlur={(e) =>
        onBlur?.(
          allowNA && /[A-Za-z]/.test(e.target.value)
            ? e.target.value.replace(/[^A-Za-z]/g, "").toUpperCase()
            : clean(e.target.value)
        )
      }
    />
  );
}
