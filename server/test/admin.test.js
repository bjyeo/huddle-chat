import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import request from 'supertest';
import { describeRemoval, removeUser } from '../src/admin.js';
import { PASSWORD, connectSocket, generalChannel, registerUser, startServer } from './helpers.js';

describe('removeUser (npm run remove-user)', () => {
  it('deletes the user, their messages and sessions, keeps their channels and frees the slot', async () => {
    const server = await startServer({ maxUsers: 2 });
    try {
      const alice = await registerUser(server, 'alice');
      const bob = await registerUser(server, 'bob');
      const general = await generalChannel(alice.agent);

      // A second session for alice, a channel she owns and messages from both users.
      const phone = request.agent(server.url);
      await phone.post('/api/auth/login').send({ username: 'alice', password: PASSWORD });
      const channel = (await alice.agent.post('/api/channels').send({ name: 'alices-room' })).body
        .channel;
      for (const content of ['one', 'two']) {
        await alice.agent.post(`/api/channels/${channel.id}/messages`).send({ content });
      }
      await alice.agent.post(`/api/channels/${general.id}/messages`).send({ content: 'three' });
      await bob.agent.post(`/api/channels/${general.id}/messages`).send({ content: 'from bob' });
      const socket = await connectSocket(server, { cookie: alice.cookie });
      const kicked = new Promise((resolve) => socket.once('disconnect', resolve));

      const result = removeUser(server.db, 'ALICE'); // usernames match case-insensitively
      assert.deepEqual(result, {
        user: alice.user,
        messages: 3,
        sessions: 2,
        channels: 1,
        remainingUsers: 1,
      });

      // Her sessions are revoked everywhere: REST at once, open sockets on the next sweep.
      assert.equal((await alice.agent.get('/api/auth/me')).status, 401);
      assert.equal((await phone.get('/api/auth/me')).status, 401);
      assert.equal(await kicked, 'io server disconnect');

      // Her channel survives with no owner; only bob's message is left.
      const channels = (await bob.agent.get('/api/channels')).body.channels;
      assert.equal(channels.find((c) => c.id === channel.id).createdBy, null);
      const inChannel = (await bob.agent.get(`/api/channels/${channel.id}/messages`)).body;
      assert.deepEqual(inChannel.messages, []);
      const inGeneral = (await bob.agent.get(`/api/channels/${general.id}/messages`)).body;
      assert.deepEqual(
        inGeneral.messages.map((m) => m.content),
        ['from bob'],
      );
      const users = (await bob.agent.get('/api/users')).body.users;
      assert.deepEqual(
        users.map((u) => u.username),
        ['bob'],
      );

      // The freed slot can be used again, even with the old username.
      await registerUser(server, 'alice');
      const sessions = server.db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?');
      assert.equal(sessions.get(alice.user.id).n, 0);
    } finally {
      await server.stop();
    }
  });

  it('returns null and changes nothing for an unknown username', async () => {
    const server = await startServer();
    try {
      await registerUser(server, 'dave');
      assert.equal(removeUser(server.db, 'nobody'), null);
      assert.equal(server.db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 1);
    } finally {
      await server.stop();
    }
  });

  it('describes what it did', () => {
    const user = { id: 3, username: 'alice', displayName: 'Alice', createdAt: '' };
    const text = describeRemoval({
      user,
      messages: 1,
      sessions: 2,
      channels: 1,
      remainingUsers: 4,
    });
    assert.match(text, /Removed user "alice" \(id 3/);
    assert.match(text, /deleted 1 message$/m);
    assert.match(text, /revoked 2 sessions/);
    assert.match(text, /kept 1 channel they created/);
    assert.match(text, /4 members left/);
    assert.doesNotMatch(
      describeRemoval({ user, messages: 0, sessions: 0, channels: 0, remainingUsers: 0 }),
      /channel/,
    );
  });
});
