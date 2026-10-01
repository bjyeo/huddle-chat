import { useMemo } from 'react';
import { useChatScroll } from '../hooks/useChatScroll.js';
import { groupMessages } from '../lib/groupMessages.js';
import { Message } from './Message.jsx';

function Welcome({ channel }) {
  return (
    <div className="welcome">
      <div className="welcome__icon" aria-hidden="true">
        #
      </div>
      <h2 className="welcome__title">Welcome to #{channel.name}!</h2>
      <p className="welcome__text">
        This is the start of the #{channel.name} channel.
        {channel.topic && ` ${channel.topic}`}
      </p>
    </div>
  );
}

export function MessageList({
  channel,
  currentUserId,
  messages,
  loading,
  error,
  hasMore,
  loadOlder,
  onEdit,
  onDelete,
}) {
  const rows = useMemo(() => groupMessages(messages), [messages]);
  const { ref, onScroll } = useChatScroll({ messages, hasMore, loadOlder, currentUserId });

  return (
    <section
      ref={ref}
      className="message-list"
      onScroll={onScroll}
      aria-label={`Messages in #${channel.name}`}
      tabIndex={0}
    >
      {loading && <p className="message-list__status">Loading messages…</p>}
      {error && (
        <p className="message-list__status form-error" role="alert">
          {error}
        </p>
      )}
      {!loading && !error && !hasMore && <Welcome channel={channel} />}
      {hasMore && (
        <button type="button" className="btn btn--ghost message-list__older" onClick={loadOlder}>
          Load older messages
        </button>
      )}

      <ol className="message-list__items">
        {rows.map((row) =>
          row.type === 'divider' ? (
            <li key={row.key} className="date-divider">
              <span>{row.label}</span>
            </li>
          ) : (
            <li key={row.key}>
              <Message
                message={row.message}
                grouped={row.grouped}
                isOwn={row.message.author.id === currentUserId}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            </li>
          ),
        )}
      </ol>
    </section>
  );
}
