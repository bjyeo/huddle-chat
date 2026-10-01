import { useCallback, useEffect, useRef, useState } from 'react';
import { useSocketEvent } from './useSocket.jsx';

/** Messages arriving within this long of an announcement are collapsed into the next one. */
export const BURST_MS = 1500;
const MAX_CONTENT = 140;
const KEEP = 3; // announcements kept in the DOM; screen readers only read additions

const excerpt = (content) => {
  const text = content.replace(/\s+/g, ' ').trim();
  return text.length > MAX_CONTENT ? `${text.slice(0, MAX_CONTENT - 1)}…` : text;
};

const said = (message) => `${message.author.displayName}: ${excerpt(message.content)}`;

function names(messages) {
  const unique = [...new Set(messages.map((m) => m.author.displayName))];
  if (unique.length === 1) return unique[0];
  if (unique.length <= 3) return `${unique.slice(0, -1).join(', ')} and ${unique.at(-1)}`;
  return 'several people';
}

/** One message → "Alice: hi"; a burst → "3 new messages from Alice and Bob. Bob: latest". */
export function describeArrivals(messages) {
  if (messages.length === 1) return said(messages[0]);
  return `${messages.length} new messages from ${names(messages)}. ${said(messages.at(-1))}`;
}

/**
 * Screen-reader announcements for messages that arrive live in `channelId` from other people.
 * Only socket `message:created` events count, so the initial page, `loadOlder` history, reconnect
 * re-syncs and your own messages are never announced. The first message is announced at once;
 * anything arriving in the following BURST_MS is collapsed into a single summary.
 */
export function useMessageAnnouncements(channelId, currentUserId) {
  const [announcements, setAnnouncements] = useState([]);
  const queue = useRef([]);
  const seen = useRef(new Set());
  const timer = useRef(null);
  const nextKey = useRef(0);

  const flush = useCallback(() => {
    const batch = queue.current;
    if (batch.length === 0) {
      timer.current = null;
      return;
    }
    queue.current = [];
    const announcement = { key: nextKey.current++, text: describeArrivals(batch) };
    setAnnouncements((list) => [...list, announcement].slice(-KEEP));
    timer.current = setTimeout(flush, BURST_MS);
  }, []);

  useSocketEvent('message:created', ({ message }) => {
    if (message.channelId !== channelId || message.author.id === currentUserId) return;
    if (seen.current.has(message.id)) return;
    seen.current.add(message.id);
    queue.current.push(message);
    if (timer.current == null) flush();
  });

  useEffect(() => () => clearTimeout(timer.current), []);

  return announcements;
}
