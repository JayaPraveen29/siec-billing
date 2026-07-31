import "./StatCard.css";

export default function StatCard({ label, value, accent = "paper", sub }) {
  const accentClass =
    {
      paper: "",
      rivet: "accent-rivet",
      ok: "accent-ok",
      warn: "accent-warn",
    }[accent] || "";

  return (
    <div className="stat-card">
      <div className="stat-card-label">{label}</div>
      <div className={`stat-card-value tabular ${accentClass}`}>{value}</div>
      {sub && <div className="stat-card-sub">{sub}</div>}
    </div>
  );
}
