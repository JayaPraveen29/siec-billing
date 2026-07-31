// Signature element: modeled on the title block found in the corner of a
// structural fabrication drawing — a bordered grid of stamped fields.
import "./TitleBlock.css";

export default function TitleBlock({ docType, fields = [], company = "SIEC INDIA PVT LTD" }) {
  return (
    <div className="title-block">
      <div className="title-block-top">
        <div className="title-block-icon">
          <svg width="26" height="26" viewBox="0 0 32 32">
            <path d="M4 8H28V12H18V20H28V24H4V20H14V12H4Z" fill="currentColor" />
          </svg>
        </div>
        <div className="title-block-main">
          <div className="title-block-company">{company}</div>
          <div className="title-block-doctype">{docType}</div>
        </div>
      </div>
      {fields.length > 0 && (
        <div
          className="title-block-fields"
          style={{ gridTemplateColumns: `repeat(${fields.length}, minmax(0,1fr))` }}
        >
          {fields.map((f, i) => (
            <div key={i} className={`title-block-field${i > 0 ? " bordered" : ""}`}>
              <div className="title-block-field-label">{f.label}</div>
              <div className="title-block-field-value tabular">{f.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
