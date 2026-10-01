import { useState } from 'react';
import { MESSAGE_MAX, isBlank } from '../lib/validation.js';
import { useAsyncAction } from './useAsyncAction.js';

/** Draft state for the message composer. */
export function useComposer({ send, notifyTyping }) {
  const [draft, setDraft] = useState('');
  const { run, pending, error, setError } = useAsyncAction(send);
  const content = draft.trim();
  const remaining = MESSAGE_MAX - content.length;
  const canSend = !isBlank(content) && remaining >= 0 && !pending;

  const change = (value) => {
    setDraft(value);
    setError(null);
    if (!isBlank(value)) notifyTyping();
  };

  const submit = async () => {
    if (canSend && (await run(content))) setDraft('');
  };

  return { draft, change, submit, pending, error, remaining, canSend };
}
