import { TYPING_THROTTLE_MS } from '@huddle/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSocket, useSocketEvent } from './useSocket.jsx';

// Several throttle windows, so one dropped or late event doesn't make the indicator flicker.
export const TYPING_TTL_MS = 4 * TYPING_THROTTLE_MS;

/**
 * Who else is typing in `channelId`, plus `notifyTyping()` for our own input, throttled to the
 * server's relay rate (TYPING_THROTTLE_MS) so no event we send is dropped.
 */
export function useTyping(channelId) {
  const { socket } = useSocket();
  const [typers, setTypers] = useState([]);
  const timers = useRef(new Map());
  const lastSent = useRef(0);

  const stopTyping = useCallback((userId) => {
    clearTimeout(timers.current.get(userId));
    timers.current.delete(userId);
    setTypers((list) =>
      list.some((u) => u.id === userId) ? list.filter((u) => u.id !== userId) : list,
    );
  }, []);

  useEffect(() => {
    const pending = timers.current;
    lastSent.current = 0;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
      setTypers([]);
    };
  }, [channelId]);

  useSocketEvent('typing', ({ channelId: typingIn, user }) => {
    if (typingIn !== channelId) return;
    clearTimeout(timers.current.get(user.id));
    timers.current.set(
      user.id,
      setTimeout(() => stopTyping(user.id), TYPING_TTL_MS),
    );
    setTypers((list) => (list.some((u) => u.id === user.id) ? list : [...list, user]));
  });

  // A posted message ends that author's typing state immediately.
  useSocketEvent('message:created', ({ message }) => {
    if (message.channelId === channelId) stopTyping(message.author.id);
  });

  const notifyTyping = useCallback(() => {
    const now = Date.now();
    if (!socket || channelId == null || now - lastSent.current < TYPING_THROTTLE_MS) return;
    lastSent.current = now;
    socket.emit('typing', { channelId });
  }, [socket, channelId]);

  return { typers, notifyTyping };
}
