import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { generalChannel, registerUser, startServer } from './helpers.js';

describe('channels', () => {
  let server, alice, bob;
  before(async () => {
    server = await startServer();
    alice = await registerUser(server, 'alice');
    bob = await registerUser(server, 'bob');
  });
  after(() => server.stop());

  it('lists the seeded #general channel', async () => {
    const res = await alice.agent.get('/api/channels');
    assert.equal(res.status, 200);
    const [general] = res.body.channels;
    assert.equal(general.name, 'general');
    assert.equal(general.createdBy, null);
    assert.equal(typeof general.topic, 'string');
    assert.ok(!Number.isNaN(Date.parse(general.createdAt)));
  });

  it('creates a channel with a normalized name', async () => {
    const res = await alice.agent
      .post('/api/channels')
      .send({ name: '  Game   Night ', topic: ' Fridays ' });
    assert.equal(res.status, 201);
    assert.equal(res.body.channel.name, 'game-night');
    assert.equal(res.body.channel.topic, 'Fridays');
    assert.equal(res.body.channel.createdBy, alice.user.id);

    const list = await bob.agent.get('/api/channels');
    const ids = list.body.channels.map((c) => c.id);
    assert.deepEqual(
      ids,
      [...ids].sort((a, b) => a - b),
    );
    assert.ok(list.body.channels.some((c) => c.name === 'game-night'));
  });

  it('defaults the topic to an empty string', async () => {
    const res = await alice.agent.post('/api/channels').send({ name: 'random' });
    assert.equal(res.status, 201);
    assert.equal(res.body.channel.topic, '');
  });

  it('rejects duplicate names after normalization with 409', async () => {
    for (const name of ['game-night', 'GAME NIGHT', 'General']) {
      const res = await bob.agent.post('/api/channels').send({ name });
      assert.equal(res.status, 409, name);
      assert.equal(typeof res.body.error, 'string');
    }
  });

  for (const [label, body] of [
    ['a missing name', {}],
    ['an empty name', { name: '   ' }],
    ['invalid characters', { name: 'no_underscores!' }],
    ['a name over 32 chars', { name: 'x'.repeat(33) }],
    ['a non-string name', { name: 42 }],
    ['a topic over 120 chars', { name: 'long-topic', topic: 't'.repeat(121) }],
    ['a non-string topic', { name: 'bad-topic', topic: ['nope'] }],
  ]) {
    it(`rejects ${label} with 400`, async () => {
      const res = await alice.agent.post('/api/channels').send(body);
      assert.equal(res.status, 400);
      assert.equal(typeof res.body.error, 'string');
    });
  }

  it('only lets the creator delete a channel', async () => {
    const { body } = await alice.agent.post('/api/channels').send({ name: 'alice-only' });
    const res = await bob.agent.delete(`/api/channels/${body.channel.id}`);
    assert.equal(res.status, 403);
    assert.equal((await alice.agent.delete(`/api/channels/${body.channel.id}`)).status, 204);
  });

  it('never deletes #general', async () => {
    const general = await generalChannel(alice.agent);
    const res = await alice.agent.delete(`/api/channels/${general.id}`);
    assert.equal(res.status, 403);
    assert.ok(await generalChannel(alice.agent));
  });

  it('returns 404 for unknown or malformed ids', async () => {
    assert.equal((await alice.agent.delete('/api/channels/9999')).status, 404);
    assert.equal((await alice.agent.delete('/api/channels/abc')).status, 404);
  });

  it('deletes the channel’s messages too', async () => {
    const { body } = await alice.agent.post('/api/channels').send({ name: 'doomed' });
    const id = body.channel.id;
    await alice.agent.post(`/api/channels/${id}/messages`).send({ content: 'bye' });
    const posted = await bob.agent.post(`/api/channels/${id}/messages`).send({ content: 'cya' });

    assert.equal((await alice.agent.delete(`/api/channels/${id}`)).status, 204);
    const count = server.db
      .prepare('SELECT COUNT(*) AS n FROM messages WHERE channel_id = ?')
      .get(id).n;
    assert.equal(count, 0);
    assert.equal((await bob.agent.get(`/api/channels/${id}/messages`)).status, 404);
    assert.equal(
      (await bob.agent.patch(`/api/messages/${posted.body.message.id}`).send({ content: 'x' }))
        .status,
      404,
    );
  });
});

describe('channel cap', () => {
  it('returns 403 once 50 channels exist', async () => {
    const server = await startServer();
    try {
      const { agent } = await registerUser(server, 'maker');
      for (let i = 1; i < 50; i++) {
        const res = await agent.post('/api/channels').send({ name: `room-${i}` });
        assert.equal(res.status, 201);
      }
      const res = await agent.post('/api/channels').send({ name: 'one-too-many' });
      assert.equal(res.status, 403);
      assert.equal(typeof res.body.error, 'string');
    } finally {
      await server.stop();
    }
  });
});
