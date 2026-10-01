import { useCallback, useEffect, useReducer, useRef } from 'react';
import * as api from '../api.js';
import { initialMessagesState, messagesReducer, PAGE_SIZE } from '../lib/messagesReducer.js';
import { useOnReconnect, useSocketEvent } from './useSocket.jsx';

/** Messages of one channel: paginated history, CRUD and live socket updates. */
export function useMessages(channelId) {
  const [state, dispatch] = useReducer(messagesReducer, channelId, initialMessagesState);
  const loadingOlder = useRef(false);

  // Reset synchronously on channel change so the previous channel never flashes.
  if (state.channelId !== channelId) dispatch({ type: 'reset', channelId });

  const fetchLatest = useCallback(
    async (type) => {
      try {
        const { messages } = await api.getMessages(channelId, { limit: PAGE_SIZE });
        dispatch({ type, channelId, messages });
      } catch (err) {
        if (type === 'loaded') dispatch({ type: 'failed', channelId, error: err.message });
      }
    },
    [channelId],
  );

  useEffect(() => {
    if (channelId != null) fetchLatest('loaded');
  }, [channelId, fetchLatest]);
  useOnReconnect(() => fetchLatest('latest'));

  useSocketEvent('message:created', ({ message }) =>
    dispatch({ type: 'upsert', channelId: message.channelId, message }),
  );
  useSocketEvent('message:updated', ({ message }) =>
    dispatch({ type: 'update', channelId: message.channelId, message }),
  );
  useSocketEvent('message:deleted', ({ id, channelId }) =>
    dispatch({ type: 'remove', channelId, id }),
  );

  const oldestId = state.messages[0]?.id;
  const canLoadOlder = state.hasMore && oldestId != null;

  const loadOlder = useCallback(async () => {
    if (!canLoadOlder || loadingOlder.current) return;
    loadingOlder.current = true;
    try {
      const { messages } = await api.getMessages(channelId, {
        before: oldestId,
        limit: PAGE_SIZE,
      });
      dispatch({ type: 'older', channelId, messages });
    } catch {
      // hasMore stays true, so scrolling up (or the button) retries.
    } finally {
      loadingOlder.current = false;
    }
  }, [canLoadOlder, channelId, oldestId]);

  const send = useCallback(
    async (content) => {
      const { message } = await api.sendMessage(channelId, content);
      dispatch({ type: 'upsert', channelId: message.channelId, message });
    },
    [channelId],
  );

  const edit = useCallback(async (id, content) => {
    const { message } = await api.editMessage(id, content);
    dispatch({ type: 'update', channelId: message.channelId, message });
  }, []);

  const remove = useCallback(
    async (id) => {
      await api.deleteMessage(id);
      dispatch({ type: 'remove', channelId, id });
    },
    [channelId],
  );

  return {
    messages: state.messages,
    loading: state.loading,
    error: state.error,
    hasMore: state.hasMore,
    loadOlder,
    send,
    edit,
    remove,
  };
}
