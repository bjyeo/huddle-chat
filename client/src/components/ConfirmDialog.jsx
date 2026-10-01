import { useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAsyncAction } from '../hooks/useAsyncAction.js';
import { useModalFocus } from '../hooks/useModalFocus.js';

/**
 * In-app confirmation modal. Calls `onClose` after a successful `onConfirm`. Focus starts on
 * Cancel (the safe choice), stays inside the dialog and returns to the opener on close.
 */
export function ConfirmDialog({ title, children, confirmLabel = 'Delete', onConfirm, onClose }) {
  const { run, pending, error } = useAsyncAction(onConfirm);
  const titleId = useId();
  const bodyId = useId();
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);
  useModalFocus({ dialogRef, initialFocusRef: cancelRef, onClose });

  const confirm = async () => {
    if (await run()) onClose();
  };

  // Portalled outside #root so it stays interactive while useModalFocus makes the app inert.
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={dialogRef}
        className="modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
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
          <button ref={cancelRef} type="button" className="btn btn--ghost" onClick={onClose}>
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
