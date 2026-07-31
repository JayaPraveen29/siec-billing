export default function ConfirmDialog({ open, title, message, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-plate border border-line rounded-sm w-full max-w-sm p-5">
        <div className="font-display text-xl text-paper mb-1">{title}</div>
        <p className="text-sm text-muted mb-5">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded-sm border border-line text-muted hover:text-paper hover:border-muted transition"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm rounded-sm bg-warn text-paper hover:brightness-110 transition"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
