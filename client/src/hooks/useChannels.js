import { useCallback, useEffect, useState } from 'react';
import * as api from '../api.js';
import { useOnReconnect, useSocketEvent } from './useSocket.jsx';

const DEFAULT_CHANNEL = 'general';

function addChannel(channels, channel) {
  if (channels.some((c) => c.id === channel.id)) return channels;
  return [...channels, channel].sort((a, b) => a.id - b.id);
}

/** Channel list with live create/delete and the active selection (falls back to #general). */
export function useChannels() {
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeId, setActiveId] = useState(null);

  const load = useCallback(async () => {
    try {
      const { channels } = await api.getChannels();
      setChannels(channels);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useOnReconnect(load);

  const forget = useCallback((id) => {
    setChannels((list) => list.filter((c) => c.id !== id));
    setActiveId((current) => (current === id ? null : current));
  }, []);

  useSocketEvent('channel:created', ({ channel }) =>
    setChannels((list) => addChannel(list, channel)),
  );
  useSocketEvent('channel:deleted', ({ id }) => forget(id));

  const createChannel = useCallback(async ({ name, topic }) => {
    const { channel } = await api.createChannel({ name, topic: topic || undefined });
    setChannels((list) => addChannel(list, channel));
    return channel;
  }, []);

  const deleteChannel = useCallback(
    async (id) => {
      await api.deleteChannel(id);
      forget(id);
    },
    [forget],
  );

  const activeChannel =
    channels.find((c) => c.id === activeId) ??
    channels.find((c) => c.name === DEFAULT_CHANNEL) ??
    channels[0] ??
    null;

  return {
    channels,
    loading,
    error,
    activeChannel,
    selectChannel: setActiveId,
    createChannel,
    deleteChannel,
  };
}
