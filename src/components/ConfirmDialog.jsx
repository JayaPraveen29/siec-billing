import "./ConfirmDialog.css";

export default function ConfirmDialog({ open, title, message, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="modal-overlay">
      <div className="confirm-panel">
        <div className="confirm-title">{title}</div>
        <p className="confirm-message">{message}</p>
        <div className="confirm-actions">
          <button onClick={onCancel} className="btn-secondary">
            Cancel
          </button>
          <button onClick={onConfirm} className="btn-danger">
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
