import { useEffect, useState } from 'react';
import { useAuth } from './useAuth.jsx';
import { useSocketEvent } from './useSocket.jsx';

/** Set of channel ids that received messages from others while not active. */
export function useUnread(activeChannelId) {
  const { user } = useAuth();
  const [unread, setUnread] = useState(() => new Set());

  useSocketEvent('message:created', ({ message }) => {
    if (message.channelId === activeChannelId || message.author.id === user?.id) return;
    setUnread((set) => (set.has(message.channelId) ? set : new Set(set).add(message.channelId)));
  });

  useEffect(() => {
    setUnread((set) => {
      if (!set.has(activeChannelId)) return set;
      const next = new Set(set);
      next.delete(activeChannelId);
      return next;
    });
  }, [activeChannelId]);

  return unread;
}
