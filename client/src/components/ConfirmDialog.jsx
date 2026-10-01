import { useId } from 'react';
import { createPortal } from 'react-dom';
import { useAsyncAction } from '../hooks/useAsyncAction.js';

/** In-app confirmation modal. Calls `onClose` after a successful `onConfirm`. */
export function ConfirmDialog({ title, children, confirmLabel = 'Delete', onConfirm, onClose }) {
  const { run, pending, error } = useAsyncAction(onConfirm);
  const titleId = useId();
  const bodyId = useId();

  const confirm = async () => {
    if (await run()) onClose();
  };

  const onKeyDown = (event) => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    onClose();
  };

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        onKeyDown={onKeyDown}
      >
        <h2 id={titleId} className="modal__title">
          {title}
        </h2>
        <div id={bodyId} className="modal__body">
          {children}
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose} autoFocus>
            Cancel
          </button>
          <button type="button" className="btn btn--danger" onClick={confirm} disabled={pending}>
            {pending ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
