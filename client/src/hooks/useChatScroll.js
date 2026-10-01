import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

const NEAR_BOTTOM_PX = 120;
const LOAD_OLDER_PX = 80;

/**
 * Scroll behaviour for the message list: stick to the bottom only when the reader is already
 * near it (or just sent a message), keep the reading position when older history is prepended,
 * and request older history when scrolled to the top.
 */
export function useChatScroll({ messages, hasMore, loadOlder, currentUserId }) {
  const ref = useRef(null);
  const nearBottom = useRef(true);
  const snapshot = useRef({ firstId: null, lastId: null, height: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const prev = snapshot.current;
    const firstId = messages[0]?.id ?? null;
    const last = messages.at(-1);
    const prepended = prev.firstId != null && firstId != null && firstId < prev.firstId;
    const sentByMe = last && last.id !== prev.lastId && last.author.id === currentUserId;

    if (prepended) el.scrollTop += el.scrollHeight - prev.height;
    else if (nearBottom.current || sentByMe) el.scrollTop = el.scrollHeight;

    snapshot.current = { firstId, lastId: last?.id ?? null, height: el.scrollHeight };
  }, [messages, currentUserId]);

  // Stay pinned to the bottom when the viewport shrinks (composer grows, keyboard opens).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (nearBottom.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const onScroll = useCallback(() => {
    const el = ref.current;
    nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    if (el.scrollTop < LOAD_OLDER_PX && hasMore) loadOlder();
  }, [hasMore, loadOlder]);

  return { ref, onScroll };
}
