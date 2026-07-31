export default function Loading({ label = "Loading" }) {
  return (
    <div className="flex items-center gap-3 text-muted py-10 justify-center">
      <span className="w-4 h-4 border-2 border-rivet border-t-transparent rounded-full animate-spin" />
      <span className="font-display tracking-wide uppercase text-sm">{label}</span>
    </div>
  );
}
