export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = 'Delete permanently',
  cancelLabel = 'Cancel',
  isBusy = false,
  onConfirm,
  onCancel,
}) {
  if (!isOpen) {
    return null
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={title || 'Confirm action'}>
      <div className="modal-card">
        <h3>{title || 'Confirm action'}</h3>
        <p>{message || 'This action cannot be undone.'}</p>
        <div className="modal-actions">
          <button type="button" className="ghost-btn" onClick={onCancel} disabled={isBusy}>
            {cancelLabel}
          </button>
          <button type="button" className="danger-btn" onClick={onConfirm} disabled={isBusy}>
            {isBusy ? 'Working...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

