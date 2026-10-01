import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import {
  PASSWORD,
  collectEvents,
  connectSocket,
  generalChannel,
  registerUser,
  sessionCookie,
  startServer,
  waitForEvent,
} from './helpers.js';

describe('realtime', () => {
  let server, alice, bob, general;

  /** Logs an existing user in again, creating a separate session. */
  const loginAgain = async (who) => {
    const agent = request.agent(server.url);
    const res = await agent
      .post('/api/auth/login')
      .send({ username: who.user.username, password: PASSWORD });
    assert.equal(res.status, 200);
    return { agent, cookie: sessionCookie(res) };
  };
  const sockets = [];
  const connect = async (who, options = { cookie: who.cookie }) => {
    const socket = await connectSocket(server, options);
    sockets.push(socket);
    return socket;
  };

  before(async () => {
    server = await startServer();
    alice = await registerUser(server, 'alice', { displayName: 'Alice' });
    bob = await registerUser(server, 'bob', { displayName: 'Bob' });
    general = await generalChannel(alice.agent);
  });
  afterEach(async () => {
    for (const socket of sockets.splice(0)) socket.disconnect();
    // Let the server process disconnects so presence starts clean for the next test.
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
  after(() => server.stop());

  it('rejects connections without a valid session', async () => {
    await assert.rejects(connectSocket(server), { message: 'Not authenticated' });
    await assert.rejects(connectSocket(server, { cookie: 'token=forged' }), {
      message: 'Not authenticated',
    });
  });

  it('accepts the token via handshake auth as a fallback', async () => {
    const token = alice.cookie.slice('token='.length);
    const socket = await connect(alice, { auth: { token } });
    assert.ok(socket.connected);
  });

  it('rejects websocket handshakes from foreign origins', async () => {
    await assert.rejects(
      connectSocket(server, { cookie: alice.cookie, origin: 'https://evil.example' }),
    );
  });

  it('broadcasts message:created after a REST post', async () => {
    const socket = await connect(bob);
    const event = waitForEvent(socket, 'message:created');
    const res = await alice.agent
      .post(`/api/channels/${general.id}/messages`)
      .send({ content: 'hi bob' });
    assert.deepEqual(await event, { message: res.body.message });
  });

  it('broadcasts message:updated, message:deleted and channel events', async () => {
    const socket = await connect(bob);
    const { body } = await alice.agent
      .post(`/api/channels/${general.id}/messages`)
      .send({ content: 'draft' });
    const id = body.message.id;

    const updated = waitForEvent(socket, 'message:updated');
    await alice.agent.patch(`/api/messages/${id}`).send({ content: 'final' });
    assert.equal((await updated).message.content, 'final');

    const deleted = waitForEvent(socket, 'message:deleted');
    await alice.agent.delete(`/api/messages/${id}`);
    assert.deepEqual(await deleted, { id, channelId: general.id });

    const created = waitForEvent(socket, 'channel:created');
    const channel = (await alice.agent.post('/api/channels').send({ name: 'live' })).body.channel;
    assert.deepEqual(await created, { channel });

    const removed = waitForEvent(socket, 'channel:deleted');
    await alice.agent.delete(`/api/channels/${channel.id}`);
    assert.deepEqual(await removed, { id: channel.id });
  });

  it('broadcasts user:joined on registration', async () => {
    const socket = await connect(alice);
    const joined = waitForEvent(socket, 'user:joined');
    const carol = await registerUser(server, 'carol');
    assert.deepEqual(await joined, { user: carol.user });
  });

  it('emits presence:update on first connect and last disconnect only', async () => {
    const watcher = await connect(alice);
    const isBob = (online) => (p) => p.userId === bob.user.id && p.online === online;

    const online = waitForEvent(watcher, 'presence:update', isBob(true));
    const bob1 = await connect(bob);
    await online;

    // A second tab for bob doesn't announce anything new.
    const extra = collectEvents(watcher, 'presence:update', 200);
    const bob2 = await connect(bob);
    bob1.disconnect();
    assert.deepEqual(await extra, []);

    const offline = waitForEvent(watcher, 'presence:update', isBob(false));
    bob2.disconnect();
    await offline;
  });

  it('reports presence in GET /api/users', async () => {
    const watcher = await connect(bob);
    const online = waitForEvent(watcher, 'presence:update', (p) => p.userId === alice.user.id);
    await connect(alice);
    await online;

    const res = await alice.agent.get('/api/users');
    assert.equal(res.status, 200);
    const byName = Object.fromEntries(res.body.users.map((u) => [u.username, u]));
    assert.equal(byName.alice.online, true);
    assert.equal(byName.bob.online, true);
    assert.equal(byName.carol.online, false);
    assert.deepEqual(Object.keys(byName.alice).sort(), [
      'createdAt',
      'displayName',
      'id',
      'online',
      'username',
    ]);
    // Ordered by displayName, case-insensitively.
    assert.deepEqual(
      res.body.users.map((u) => u.displayName),
      ['Alice', 'Bob', 'carol'],
    );
  });

  it('relays typing to others but not the sender', async () => {
    const aliceSocket = await connect(alice);
    const aliceTab2 = await connect(alice);
    const bobSocket = await connect(bob);

    const seenByAlice = collectEvents(aliceSocket, 'typing', 300);
    const seenByAliceTab2 = collectEvents(aliceTab2, 'typing', 300);
    const seenByBob = waitForEvent(bobSocket, 'typing');
    aliceSocket.emit('typing', { channelId: general.id });

    assert.deepEqual(await seenByBob, {
      channelId: general.id,
      user: { id: alice.user.id, displayName: 'Alice' },
    });
    assert.deepEqual(await seenByAlice, []);
    assert.deepEqual(await seenByAliceTab2, []);
  });

  it('logout disconnects that session’s sockets but not other devices', async () => {
    const watcher = await connect(alice);
    const isBob = (online) => (p) => p.userId === bob.user.id && p.online === online;

    // A second login is a separate session (another device).
    const phone = await loginAgain(bob);
    const laptopSocket = await connect(bob);
    const phoneSocket = await connect(bob, { cookie: phone.cookie });

    const kicked = new Promise((resolve) => laptopSocket.once('disconnect', resolve));
    const extra = collectEvents(watcher, 'presence:update', 300);
    assert.equal((await bob.agent.post('/api/auth/logout')).status, 204);
    assert.equal(await kicked, 'io server disconnect');
    assert.ok(phoneSocket.connected);
    assert.deepEqual(await extra, []);

    const offline = waitForEvent(watcher, 'presence:update', isBob(false));
    await phone.agent.post('/api/auth/logout');
    await offline;
    assert.equal(phoneSocket.connected, false);
    // Log bob back in for the following tests.
    bob = { ...bob, ...(await loginAgain(bob)) };
  });

  it('disconnects a socket when its session token expires', async () => {
    const token = jwt.sign(
      { sub: alice.user.id, exp: Math.floor(Date.now() / 1000) + 1 },
      server.config.jwtSecret,
    );
    const socket = await connect(alice, { auth: { token } });
    const reason = await new Promise((resolve) => socket.once('disconnect', resolve));
    assert.equal(reason, 'io server disconnect');
  });

  it('ignores typing for unknown channels or bad payloads', async () => {
    const aliceSocket = await connect(alice);
    const bobSocket = await connect(bob);
    const seen = collectEvents(bobSocket, 'typing', 300);
    aliceSocket.emit('typing', { channelId: 9999 });
    aliceSocket.emit('typing', { channelId: 'general' });
    aliceSocket.emit('typing', null);
    assert.deepEqual(await seen, []);
  });
});
