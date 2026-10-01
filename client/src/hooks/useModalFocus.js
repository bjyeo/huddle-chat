import { useLayoutEffect } from 'react';
import { useLatest } from './useLatest.js';

const TABBABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

// Open modals; the app root stays inert until the last one closes.
let openCount = 0;

/**
 * Where focus goes when the opener itself is gone (e.g. the dialog deleted it): its nearest
 * tabbable ancestor that survived (the message list after deleting a message), else the first
 * tabbable element in its nearest surviving ancestor (the channel list after deleting a channel).
 */
function fallbackTarget(ancestors) {
  const alive = ancestors.filter(
    (el) => el.isConnected && el !== document.body && el !== document.documentElement,
  );
  return alive.find((el) => el.matches(TABBABLE)) ?? alive[0]?.querySelector(TABBABLE) ?? null;
}

const focusLost = () => !document.activeElement || document.activeElement === document.body;

/**
 * Makes `dialogRef` a real modal for as long as the calling component is mounted: focuses
 * `initialFocusRef` (else the dialog itself), makes `#root` inert, traps Tab, closes on Escape from
 * anywhere in the document, and gives focus back to whatever had it before on close.
 *
 * Keys go through a capturing document listener that stops Escape, so document-level Escape
 * handlers elsewhere (the mobile drawer in usePanels) never also react to it.
 */
export function useModalFocus({ dialogRef, initialFocusRef, onClose }) {
  const onCloseRef = useLatest(onClose);

  // A layout effect, so focus moves (and the background goes inert) before the first paint.
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    const opener = document.activeElement;
    const ancestors = [];
    for (let el = opener?.parentElement; el; el = el.parentElement) ancestors.push(el);

    const root = document.getElementById('root');
    if (openCount++ === 0) root?.setAttribute('inert', '');
    (initialFocusRef?.current ?? dialog).focus();

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = Array.from(dialog.querySelectorAll(TABBABLE));
      const active = document.activeElement;
      const inside = dialog.contains(active) && active !== dialog;
      if (items.length === 0) {
        event.preventDefault();
        dialog.focus();
      } else if (event.shiftKey && (!inside || active === items[0])) {
        event.preventDefault();
        items.at(-1).focus();
      } else if (!event.shiftKey && (!inside || active === items.at(-1))) {
        event.preventDefault();
        items[0].focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      // Un-inert first: focusing an element inside an inert subtree does nothing.
      if (--openCount === 0) root?.removeAttribute('inert');
      if (opener?.isConnected) opener.focus();
      // If this unmount also removes the opener (confirming a delete removes its row in the same
      // commit), focus falls to <body> once the commit finishes; recover it from there.
      queueMicrotask(() => {
        if (focusLost()) (opener?.isConnected ? opener : fallbackTarget(ancestors))?.focus();
      });
    };
  }, [dialogRef, initialFocusRef, onCloseRef]);
}
