export default function StatCard({ label, value, accent = "paper", sub }) {
  const accentClass =
    {
      paper: "text-paper",
      rivet: "text-rivet2",
      ok: "text-ok",
      warn: "text-warn",
    }[accent] || "text-paper";

  return (
    <div className="bg-plate border border-line rounded-sm px-5 py-4 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-1 h-full bg-rivet/70" />
      <div className="text-[11px] uppercase tracking-widest text-muted font-display">
        {label}
      </div>
      <div className={`font-mono text-2xl mt-1 tabular ${accentClass}`}>
        {value}
      </div>
      {sub && <div className="text-xs text-muted mt-1">{sub}</div>}
    </div>
  );
}
