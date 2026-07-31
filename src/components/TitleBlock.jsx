// Signature element: modeled on the title block found in the corner of a
// structural fabrication drawing — a bordered grid of stamped fields.
export default function TitleBlock({ docType, fields = [], company = "SIEC INDIA PVT LTD" }) {
  return (
    <div className="border border-line bg-plate rounded-sm overflow-hidden">
      <div className="flex items-stretch">
        <div className="flex items-center justify-center px-4 py-3 border-r border-line bg-plate2 min-w-[64px]">
          <svg width="26" height="26" viewBox="0 0 32 32" className="text-rivet">
            <path
              d="M4 8H28V12H18V20H28V24H4V20H14V12H4Z"
              fill="currentColor"
            />
          </svg>
        </div>
        <div className="flex-1 px-4 py-3 border-r border-line">
          <div className="font-display text-2xl tracking-wide leading-none">
            {company}
          </div>
          <div className="text-xs text-rivet font-mono tracking-[0.2em] uppercase mt-1">
            {docType}
          </div>
        </div>
      </div>
      {fields.length > 0 && (
        <div
          className="grid border-t border-line"
          style={{ gridTemplateColumns: `repeat(${fields.length}, minmax(0,1fr))` }}
        >
          {fields.map((f, i) => (
            <div
              key={i}
              className={`px-4 py-2 ${i > 0 ? "border-l border-line" : ""}`}
            >
              <div className="text-[10px] uppercase tracking-widest text-muted font-display">
                {f.label}
              </div>
              <div className="font-mono text-sm text-paper mt-0.5 tabular">
                {f.value}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
