import "./Loading.css";

export default function Loading({ label = "Loading" }) {
  return (
    <div className="loading">
      <span className="loading-spinner" />
      <span className="loading-label">{label}</span>
    </div>
  );
}
