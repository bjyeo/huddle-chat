import { useLayoutEffect, useRef } from 'react';

/** A stable ref that always holds the latest value (for long-lived listeners). */
export function useLatest(value) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
