import { useEffect, useId, useRef } from 'react';
import { useComposer } from '../hooks/useComposer.js';
import { SendIcon } from './icons.jsx';

const COUNTER_THRESHOLD = 200;

/** Enter sends, Shift+Enter inserts a newline. */
export function Composer({ channelName, send, notifyTyping }) {
  const { draft, change, submit, pending, error, remaining, canSend } = useComposer({
    send,
    notifyTyping,
  });
  const inputRef = useRef(null);
  const wasPending = useRef(false);
  const id = useId();

  // The textarea is disabled while sending, which drops focus; give it back afterwards.
  useEffect(() => {
    if (wasPending.current && !pending) inputRef.current?.focus();
    wasPending.current = pending;
  }, [pending]);

  const onKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <form
      className="composer"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className={`composer__box${remaining < 0 ? ' composer__box--over' : ''}`}>
        <label htmlFor={id} className="visually-hidden">
          Message #{channelName}
        </label>
        <textarea
          id={id}
          ref={inputRef}
          className="composer__input"
          rows={1}
          value={draft}
          placeholder={`Message #${channelName}`}
          onChange={(e) => change(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={pending}
          aria-invalid={remaining < 0}
          aria-describedby={`${id}-counter`}
        />
        <span
          id={`${id}-counter`}
          className={`composer__counter${remaining < 0 ? ' composer__counter--over' : ''}`}
        >
          {remaining <= COUNTER_THRESHOLD ? remaining : ''}
        </span>
        <button
          type="submit"
          className="icon-btn composer__send"
          aria-label="Send message"
          disabled={!canSend}
        >
          <SendIcon size={18} />
        </button>
      </div>
      {error && (
        <p className="composer__error form-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
