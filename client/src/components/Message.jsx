import { useState } from 'react';
import { formatFull, formatStamp, formatTime } from '../lib/time.js';
import { Avatar } from './Avatar.jsx';
import { ConfirmDialog } from './ConfirmDialog.jsx';
import { MessageContent } from './MessageContent.jsx';
import { MessageEditor } from './MessageEditor.jsx';
import { PencilIcon, TrashIcon } from './icons.jsx';

export function Message({ message, grouped, isOwn, onEdit, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const { author, createdAt, editedAt } = message;

  const save = async (content) => {
    await onEdit(message.id, content);
    setEditing(false);
  };

  return (
    <article className={`message${grouped ? ' message--grouped' : ''}`}>
      <div className="message__gutter">
        {grouped ? (
          <time className="message__hover-time" dateTime={createdAt} title={formatFull(createdAt)}>
            {formatTime(createdAt)}
          </time>
        ) : (
          <Avatar user={author} />
        )}
      </div>

      <div className="message__body">
        {!grouped && (
          <header className="message__header">
            <span className="message__author">{author.displayName}</span>
            <time className="message__time" dateTime={createdAt} title={formatFull(createdAt)}>
              {formatStamp(createdAt)}
            </time>
          </header>
        )}
        {editing ? (
          <MessageEditor
            initial={message.content}
            onSave={save}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <p className="message__content">
            <MessageContent content={message.content} />
            {editedAt && (
              <span className="message__edited" title={`Edited ${formatFull(editedAt)}`}>
                {' '}
                (edited)
              </span>
            )}
          </p>
        )}
      </div>

      {isOwn && !editing && (
        <div className="message__actions">
          <button
            type="button"
            className="icon-btn"
            aria-label="Edit message"
            title="Edit"
            onClick={() => setEditing(true)}
          >
            <PencilIcon size={18} />
          </button>
          <button
            type="button"
            className="icon-btn icon-btn--danger"
            aria-label="Delete message"
            title="Delete"
            onClick={() => setConfirming(true)}
          >
            <TrashIcon size={18} />
          </button>
        </div>
      )}

      {confirming && (
        <ConfirmDialog
          title="Delete message"
          onConfirm={() => onDelete(message.id)}
          onClose={() => setConfirming(false)}
        >
          Are you sure you want to delete this message? This can’t be undone.
        </ConfirmDialog>
      )}
    </article>
  );
}
