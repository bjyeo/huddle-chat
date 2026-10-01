export const PAGE_SIZE = 50;

export const initialMessagesState = (channelId) => ({
  channelId,
  messages: [],
  hasMore: false,
  loading: true,
  error: null,
});

/** Inserts or replaces `message`, keeping the list sorted by id (dedupes POST + broadcast). */
function upsert(list, message) {
  const index = list.findIndex((m) => m.id === message.id);
  if (index !== -1) return list.toSpliced(index, 1, message);
  const insertAt = list.findLastIndex((m) => m.id < message.id) + 1;
  return list.toSpliced(insertAt, 0, message);
}

function prepend(list, older) {
  const known = new Set(list.map((m) => m.id));
  return [...older.filter((m) => !known.has(m.id)), ...list];
}

/**
 * Merges a fresh newest page (after a reconnect): the server's view wins from the page's oldest
 * id onward. Older loaded history is kept only if it connects to the page without a gap.
 */
function mergeLatest(state, latest) {
  if (latest.length < PAGE_SIZE) return { ...state, messages: latest, hasMore: false };
  const floor = latest[0].id;
  if (!state.messages.some((m) => m.id >= floor)) {
    return { ...state, messages: latest, hasMore: true };
  }
  return { ...state, messages: [...state.messages.filter((m) => m.id < floor), ...latest] };
}

/** Every action carries a `channelId`; actions for any other channel are ignored. */
export function messagesReducer(state, action) {
  if (action.type === 'reset') return initialMessagesState(action.channelId);
  if (action.channelId !== state.channelId) return state;

  switch (action.type) {
    case 'loaded': {
      // Socket events can land while the first page is in flight; keep anything newer than it.
      const lastId = action.messages.at(-1)?.id ?? 0;
      const arrived = state.messages.filter((m) => m.id > lastId);
      return {
        ...state,
        loading: false,
        error: null,
        messages: [...action.messages, ...arrived],
        hasMore: action.messages.length === PAGE_SIZE,
      };
    }
    case 'failed':
      return { ...state, loading: false, error: action.error };
    case 'older':
      return {
        ...state,
        messages: prepend(state.messages, action.messages),
        hasMore: action.messages.length === PAGE_SIZE,
      };
    case 'latest':
      return mergeLatest(state, action.messages);
    case 'upsert':
      return { ...state, messages: upsert(state.messages, action.message) };
    case 'update':
      // Only patch messages we have; edits to unloaded history are irrelevant.
      return state.messages.some((m) => m.id === action.message.id)
        ? { ...state, messages: upsert(state.messages, action.message) }
        : state;
    case 'remove':
      return { ...state, messages: state.messages.filter((m) => m.id !== action.id) };
    default:
      return state;
  }
}
