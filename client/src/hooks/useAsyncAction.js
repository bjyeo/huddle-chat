import { useCallback, useState } from 'react';
import { useLatest } from './useLatest.js';

/**
 * Wraps an async action with `pending` / `error` state. `run` resolves to `true` on success and
 * `false` on failure (the error message is kept in `error`), so handlers never need try/catch.
 */
export function useAsyncAction(action) {
  const actionRef = useLatest(action);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  const run = useCallback(
    async (...args) => {
      setPending(true);
      setError(null);
      try {
        await actionRef.current(...args);
        return true;
      } catch (err) {
        setError(err.message || 'Something went wrong');
        return false;
      } finally {
        setPending(false);
      }
    },
    [actionRef],
  );

  return { run, pending, error, setError };
}
