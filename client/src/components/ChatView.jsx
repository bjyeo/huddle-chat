import { useMessages } from '../hooks/useMessages.js';
import { useTyping } from '../hooks/useTyping.js';
import { Composer } from './Composer.jsx';
import { MessageAnnouncer } from './MessageAnnouncer.jsx';
import { MessageList } from './MessageList.jsx';
import { TypingIndicator } from './TypingIndicator.jsx';

/** The center column for one channel: history, typing line and composer. */
export function ChatView({ channel, currentUserId }) {
  const { messages, loading, error, hasMore, loadOlder, send, edit, remove } = useMessages(
    channel.id,
  );
  const { typers, notifyTyping } = useTyping(channel.id);

  // Sibling keys must differ: remounting both per channel resets scroll and draft state.
  return (
    <>
      <MessageList
        key={`messages-${channel.id}`}
        channel={channel}
        currentUserId={currentUserId}
        messages={messages}
        loading={loading}
        error={error}
        hasMore={hasMore}
        loadOlder={loadOlder}
        onEdit={edit}
        onDelete={remove}
      />
      <MessageAnnouncer
        key={`announcer-${channel.id}`}
        channelId={channel.id}
        currentUserId={currentUserId}
      />
      <TypingIndicator typers={typers} />
      <Composer
        key={`composer-${channel.id}`}
        channelName={channel.name}
        send={send}
        notifyTyping={notifyTyping}
      />
    </>
  );
}
