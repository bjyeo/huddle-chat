import { useEffect, useState } from 'react';
import * as api from '../api.js';

/** What the UI shows until (or unless) GET /api/meta answers: no cap, invite requirement unknown. */
export const UNKNOWN_META = Object.freeze({ maxUsers: null, inviteRequired: null });

let cache = null; // { promise, value } shared by every component on the page

function parseMeta(body) {
  return {
    maxUsers: Number.isInteger(body?.maxUsers) && body.maxUsers > 0 ? body.maxUsers : null,
    inviteRequired: typeof body?.inviteRequired === 'boolean' ? body.inviteRequired : null,
  };
}

function loadMeta() {
  if (!cache) {
    const entry = { value: null };
    entry.promise = api.getMeta().then(
      (body) => (entry.value = parseMeta(body)),
      () => {
        // Forget the failure so the next component that mounts tries again.
        if (cache === entry) cache = null;
        return UNKNOWN_META;
      },
    );
    cache = entry;
  }
  return cache.promise;
}

/** Test hook: forget the cached response. */
export function resetServerMeta() {
  cache = null;
}

/**
 * Server settings from GET /api/meta (`{ maxUsers, inviteRequired }`), fetched once per page load.
 * Either field is null while loading or if the request failed; callers must handle that.
 */
export function useServerMeta() {
  const [meta, setMeta] = useState(() => cache?.value ?? UNKNOWN_META);

  useEffect(() => {
    let active = true;
    loadMeta().then((loaded) => active && setMeta(loaded));
    return () => {
      active = false;
    };
  }, []);

  return meta;
}
