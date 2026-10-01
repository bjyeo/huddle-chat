import { vi } from 'vitest';

/** Minimal stand-in for a socket.io-client Socket; `serverEmit` fires server → client events. */
export function createFakeSocket() {
  const listeners = new Map();
  const on = (map) => (event, fn) => {
    if (!map.has(event)) map.set(event, new Set());
    map.get(event).add(fn);
  };
  const off = (map) => (event, fn) => map.get(event)?.delete(fn);
  const managerListeners = new Map();

  return {
    on: on(listeners),
    off: off(listeners),
    connected: false,
    emit: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    io: { on: on(managerListeners), off: off(managerListeners) },
    serverEmit(event, payload) {
      listeners.get(event)?.forEach((fn) => fn(payload));
    },
  };
}

const json = (status, body) =>
  body === undefined
    ? new Response(null, { status })
    : new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });

/**
 * Stubs global fetch with a route table: `{ 'POST /api/auth/login': [200, { user }] }`.
 * A route value may also be a (possibly async) function `(init) => [status, body]`.
 * Unknown routes → 404.
 */
export function mockFetch(routes) {
  const fetchMock = vi.fn(async (url, init = {}) => {
    const path = new URL(url, 'http://localhost').pathname;
    const route = routes[`${init.method ?? 'GET'} ${path}`];
    const [status, body] =
      typeof route === 'function' ? await route(init) : (route ?? [404, { error: 'Not found' }]);
    return json(status, body);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

let nextId = 1;
export function makeMessage(overrides = {}) {
  const id = overrides.id ?? nextId++;
  return {
    id,
    channelId: 1,
    content: `message ${id}`,
    createdAt: '2026-10-01T12:00:00.000Z',
    editedAt: null,
    author: { id: 2, username: 'bob', displayName: 'Bob' },
    ...overrides,
  };
}
