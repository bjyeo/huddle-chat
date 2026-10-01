import assert from 'node:assert/strict';
import { io as ioClient } from 'socket.io-client';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db.js';

export const PASSWORD = 'correct-horse-battery';

export function testConfig(overrides = {}) {
  return {
    nodeEnv: 'test',
    isProduction: false,
    port: 0,
    jwtSecret: 'test-secret',
    databasePath: ':memory:',
    maxUsers: 10,
    inviteCode: null,
    clientOrigin: 'http://localhost:5173',
    ...overrides,
  };
}

/** Starts a server with a fresh in-memory database on an ephemeral port. */
export async function startServer(overrides = {}) {
  const config = testConfig(overrides);
  const db = openDatabase(':memory:');
  const { httpServer, close } = createApp({ db, config });
  await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${httpServer.address().port}`;
  return {
    url,
    db,
    config,
    request: () => request(url),
    async stop() {
      await close();
      db.close();
    },
  };
}

/** Extracts `token=...` from a response's Set-Cookie header. */
export function sessionCookie(res) {
  const header = res.headers['set-cookie']?.find((c) => c.startsWith('token='));
  return header?.split(';')[0];
}

/** Registers a user and returns a cookie-carrying supertest agent for them. */
export async function registerUser(server, username, extra = {}) {
  const agent = request.agent(server.url);
  const res = await agent
    .post('/api/auth/register')
    .send({ username, password: PASSWORD, ...extra });
  assert.equal(res.status, 201, res.text);
  return { agent, user: res.body.user, cookie: sessionCookie(res) };
}

export async function generalChannel(agent) {
  const res = await agent.get('/api/channels');
  return res.body.channels.find((c) => c.name === 'general');
}

export function connectSocket(server, { cookie, auth, origin } = {}) {
  const extraHeaders = {};
  if (cookie) extraHeaders.cookie = cookie;
  if (origin) extraHeaders.origin = origin;
  return new Promise((resolve, reject) => {
    const socket = ioClient(server.url, {
      transports: ['websocket'],
      extraHeaders,
      auth,
      reconnection: false,
      forceNew: true,
    });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', (err) => {
      socket.close();
      reject(err);
    });
  });
}

/** Resolves with the first `event` payload matching `predicate`. */
export function waitForEvent(socket, event, predicate = () => true, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const handler = (payload) => {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    };
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timed out waiting for "${event}"`));
    }, timeoutMs);
    socket.on(event, handler);
  });
}

/** Collects every `event` payload received during `ms` milliseconds. */
export function collectEvents(socket, event, ms = 200) {
  const received = [];
  const handler = (payload) => received.push(payload);
  socket.on(event, handler);
  return new Promise((resolve) =>
    setTimeout(() => {
      socket.off(event, handler);
      resolve(received);
    }, ms),
  );
}
