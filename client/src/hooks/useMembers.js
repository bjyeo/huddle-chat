import { useCallback, useEffect, useMemo, useState } from 'react';
import * as api from '../api.js';
import { useAuth } from './useAuth.jsx';
import { useOnReconnect, useSocket, useSocketEvent } from './useSocket.jsx';

const byName = (a, b) =>
  a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' });

/** All members with live presence, split into online / offline. */
export function useMembers() {
  const { user } = useAuth();
  const { status } = useSocket();
  const [members, setMembers] = useState([]);

  const load = useCallback(async () => {
    try {
      const { users } = await api.getUsers();
      setMembers(users);
    } catch {
      // Keep the last known list; it re-syncs on the next reconnect.
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useOnReconnect(load);

  useSocketEvent('presence:update', ({ userId, online }) =>
    setMembers((list) => list.map((m) => (m.id === userId ? { ...m, online } : m))),
  );
  useSocketEvent('user:joined', ({ user: joined }) =>
    setMembers((list) =>
      list.some((m) => m.id === joined.id)
        ? list
        : [...list, { ...joined, online: false }].sort(byName),
    ),
  );

  return useMemo(() => {
    // Our own presence is best known from our socket, not from a possibly stale fetch.
    const all = members.map((m) =>
      m.id === user?.id ? { ...m, online: status === 'connected' } : m,
    );
    return {
      online: all.filter((m) => m.online),
      offline: all.filter((m) => !m.online),
    };
  }, [members, user?.id, status]);
}
