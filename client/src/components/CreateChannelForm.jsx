import { useId, useState } from 'react';
import { useAsyncAction } from '../hooks/useAsyncAction.js';
import {
  CHANNEL_NAME_MAX,
  normalizeChannelName,
  TOPIC_MAX,
  validateChannel,
} from '../lib/validation.js';

export function CreateChannelForm({ onCreate, onClose }) {
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const { run, pending, error, setError } = useAsyncAction(onCreate);
  const id = useId();
  const normalized = normalizeChannelName(name);

  const submit = async (event) => {
    event.preventDefault();
    const problem = validateChannel({ name, topic });
    if (problem) return setError(problem);
    if (await run({ name: normalized, topic: topic.trim() })) onClose();
  };

  return (
    <form
      className="create-channel"
      onSubmit={submit}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
      noValidate
    >
      <label htmlFor={`${id}-name`} className="field__label">
        Channel name
      </label>
      <div className="create-channel__name">
        <span aria-hidden="true">#</span>
        <input
          id={`${id}-name`}
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="new-channel"
          maxLength={CHANNEL_NAME_MAX}
          aria-describedby={`${id}-hint`}
          autoFocus
          required
        />
      </div>
      <p id={`${id}-hint`} className="field__hint">
        {name && normalized !== name ? `Will be created as #${normalized}. ` : ''}
        Lowercase letters, numbers and dashes.
      </p>

      <label htmlFor={`${id}-topic`} className="field__label">
        Topic <span className="field__optional">(optional)</span>
      </label>
      <input
        id={`${id}-topic`}
        className="input"
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        maxLength={TOPIC_MAX}
        placeholder="What's it about?"
      />

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="create-channel__actions">
        <button type="button" className="btn btn--ghost btn--small" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn btn--primary btn--small" disabled={pending}>
          {pending ? 'Creating…' : 'Create'}
        </button>
      </div>
    </form>
  );
}
