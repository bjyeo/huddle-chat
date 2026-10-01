import { isProtectedChannel } from '@huddle/shared';
import { useState } from 'react';
import { ConfirmDialog } from './ConfirmDialog.jsx';
import { CreateChannelForm } from './CreateChannelForm.jsx';
import { PlusIcon, TrashIcon } from './icons.jsx';

function ChannelItem({ channel, active, unread, canDelete, onSelect, onDelete }) {
  const [confirming, setConfirming] = useState(false);
  const className = ['channel', active && 'is-active', unread && 'is-unread']
    .filter(Boolean)
    .join(' ');

  return (
    <li className={className}>
      <button
        type="button"
        className="channel__link"
        aria-current={active ? 'page' : undefined}
        onClick={() => onSelect(channel.id)}
      >
        <span className="channel__hash" aria-hidden="true">
          #
        </span>
        <span className="channel__name">{channel.name}</span>
        {unread && (
          <span className="channel__unread">
            <span className="visually-hidden">(unread messages)</span>
          </span>
        )}
      </button>
      {canDelete && (
        <button
          type="button"
          className="icon-btn icon-btn--danger channel__delete"
          aria-label={`Delete channel ${channel.name}`}
          title="Delete channel"
          onClick={() => setConfirming(true)}
        >
          <TrashIcon size={16} />
        </button>
      )}
      {confirming && (
        <ConfirmDialog
          title="Delete channel"
          confirmLabel="Delete channel"
          onConfirm={() => onDelete(channel.id)}
          onClose={() => setConfirming(false)}
        >
          Delete <strong>#{channel.name}</strong> and all of its messages? This can’t be undone.
        </ConfirmDialog>
      )}
    </li>
  );
}

export function ChannelList({
  channels,
  activeId,
  unread,
  currentUserId,
  onSelect,
  onCreate,
  onDelete,
}) {
  const [creating, setCreating] = useState(false);

  return (
    <nav className="channels" aria-label="Channels">
      <div className="channels__heading">
        <h2>Text channels</h2>
        <button
          type="button"
          className="icon-btn"
          aria-label="Create channel"
          aria-expanded={creating}
          title="Create channel"
          onClick={() => setCreating((open) => !open)}
        >
          <PlusIcon size={18} />
        </button>
      </div>
      {creating && <CreateChannelForm onCreate={onCreate} onClose={() => setCreating(false)} />}
      <ul className="channels__list">
        {channels.map((channel) => (
          <ChannelItem
            key={channel.id}
            channel={channel}
            active={channel.id === activeId}
            unread={unread.has(channel.id)}
            canDelete={!isProtectedChannel(channel) && channel.createdBy === currentUserId}
            onSelect={onSelect}
            onDelete={onDelete}
          />
        ))}
      </ul>
    </nav>
  );
}
