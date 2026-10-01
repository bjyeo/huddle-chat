import { useId, useState } from 'react';
import { useAsyncAction } from '../hooks/useAsyncAction.js';
import { MESSAGE_MAX } from '../lib/validation.js';

/** Inline edit box: Enter saves, Shift+Enter adds a newline, Escape cancels. */
export function MessageEditor({ initial, onSave, onCancel }) {
  const [draft, setDraft] = useState(initial);
  const { run, pending, error } = useAsyncAction(onSave);
  const id = useId();

  const save = () => {
    const content = draft.trim();
    if (content === initial) return onCancel();
    if (content && content.length <= MESSAGE_MAX) run(content);
  };

  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
    } else if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      save();
    }
  };

  return (
    <div className="message-editor">
      <label htmlFor={id} className="visually-hidden">
        Edit message
      </label>
      <textarea
        id={id}
        className="message-editor__input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        disabled={pending}
        rows={1}
        autoFocus
        onFocus={(e) => e.target.setSelectionRange(draft.length, draft.length)}
      />
      <p className="message-editor__hint">
        escape to{' '}
        <button type="button" className="link-btn" onClick={onCancel}>
          cancel
        </button>{' '}
        • enter to{' '}
        <button type="button" className="link-btn" onClick={save} disabled={pending}>
          save
        </button>
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
