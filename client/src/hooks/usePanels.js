import { useCallback, useEffect, useState } from 'react';
import { useMediaQuery } from './useMediaQuery.js';

const WIDE_QUERY = '(min-width: 901px)';

/**
 * Open/closed state of the channel drawer (phones) and member list. The member list defaults to
 * open on wide screens and closed (as an overlay) on narrow ones, resetting when the width crosses.
 */
export function usePanels() {
  const wide = useMediaQuery(WIDE_QUERY);
  const [membersOpen, setMembersOpen] = useState(wide);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [prevWide, setPrevWide] = useState(wide);

  if (wide !== prevWide) {
    setPrevWide(wide);
    setMembersOpen(wide);
  }

  const toggleSidebar = useCallback(() => setSidebarOpen((open) => !open), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const toggleMembers = useCallback(() => setMembersOpen((open) => !open), []);
  const closeMembers = useCallback(() => setMembersOpen(false), []);

  const overlayOpen = sidebarOpen || (membersOpen && !wide);
  useEffect(() => {
    if (!overlayOpen) return;
    const onKeyDown = (event) => {
      // A modal on top owns Escape (useModalFocus stops it in the capture phase); belt and braces.
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      setSidebarOpen(false);
      if (!wide) setMembersOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [overlayOpen, wide]);

  return { sidebarOpen, toggleSidebar, closeSidebar, membersOpen, toggleMembers, closeMembers };
}
