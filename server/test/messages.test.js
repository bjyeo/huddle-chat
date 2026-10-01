import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { generalChannel, registerUser, startServer } from './helpers.js';

describe('messages', () => {
  let server, alice, bob, general;
  before(async () => {
    server = await startServer();
    alice = await registerUser(server, 'alice', { displayName: 'Alice' });
    bob = await registerUser(server, 'bob');
    general = await generalChannel(alice.agent);
  });
  after(() => server.stop());

  const post = (who, content, channelId = general.id) =>
    who.agent.post(`/api/channels/${channelId}/messages`).send({ content });

  it('posts a trimmed message with its author', async () => {
    const res = await post(alice, '  hello world  ');
    assert.equal(res.status, 201);
    const { message } = res.body;
    assert.equal(message.content, 'hello world');
    assert.equal(message.channelId, general.id);
    assert.equal(message.editedAt, null);
    assert.ok(!Number.isNaN(Date.parse(message.createdAt)));
    assert.deepEqual(message.author, {
      id: alice.user.id,
      username: 'alice',
      displayName: 'Alice',
    });
  });

  for (const [label, content] of [
    ['missing', undefined],
    ['blank', '   '],
    ['invisible-only', '\u200b\u200d \u2060'],
    ['too long', 'x'.repeat(2001)],
    ['non-string', 123],
  ]) {
    it(`rejects ${label} content with 400`, async () => {
      const res = await post(alice, content);
      assert.equal(res.status, 400);
      assert.equal(typeof res.body.error, 'string');
    });
  }

  it('accepts exactly 2000 characters', async () => {
    assert.equal((await post(alice, 'y'.repeat(2000))).status, 201);
  });

  it('returns 404 for a missing channel', async () => {
    assert.equal((await post(alice, 'hi', 9999)).status, 404);
    assert.equal((await alice.agent.get('/api/channels/9999/messages')).status, 404);
  });

  describe('pagination', () => {
    let channelId, ids;
    before(async () => {
      const { body } = await alice.agent.post('/api/channels').send({ name: 'history' });
      channelId = body.channel.id;
      ids = [];
      for (let i = 1; i <= 120; i++) {
        const res = await post(i % 2 ? alice : bob, `message ${i}`, channelId);
        ids.push(res.body.message.id);
      }
    });

    const page = (query) => alice.agent.get(`/api/channels/${channelId}/messages`).query(query);

    it('returns the newest 50 by default, oldest first', async () => {
      const res = await page({});
      assert.equal(res.status, 200);
      assert.deepEqual(
        res.body.messages.map((m) => m.id),
        ids.slice(-50),
      );
    });

    it('pages backwards with before and limit', async () => {
      const res = await page({ before: ids[100], limit: 10 });
      assert.deepEqual(
        res.body.messages.map((m) => m.id),
        ids.slice(90, 100),
      );
      const first = await page({ before: ids[3], limit: 10 });
      assert.deepEqual(
        first.body.messages.map((m) => m.id),
        ids.slice(0, 3),
      );
    });

    it('caps limit at 100', async () => {
      const res = await page({ limit: 500 });
      assert.equal(res.body.messages.length, 100);
    });

    it('rejects invalid before/limit with 400', async () => {
      for (const query of [{ limit: 0 }, { limit: 'abc' }, { before: -1 }, { before: 'x' }]) {
        assert.equal((await page(query)).status, 400, JSON.stringify(query));
      }
    });

    it('only returns messages from the requested channel', async () => {
      const res = await alice.agent.get(`/api/channels/${general.id}/messages`);
      assert.ok(res.body.messages.every((m) => m.channelId === general.id));
    });
  });

  describe('edit and delete', () => {
    let message;
    before(async () => {
      message = (await post(alice, 'original')).body.message;
    });

    it('lets the author edit and sets editedAt', async () => {
      const res = await alice.agent
        .patch(`/api/messages/${message.id}`)
        .send({ content: ' edited ' });
      assert.equal(res.status, 200);
      assert.equal(res.body.message.content, 'edited');
      assert.ok(!Number.isNaN(Date.parse(res.body.message.editedAt)));
      assert.equal(res.body.message.createdAt, message.createdAt);
    });

    it('validates edited content', async () => {
      for (const content of [' ', '\u200b']) {
        const res = await alice.agent.patch(`/api/messages/${message.id}`).send({ content });
        assert.equal(res.status, 400);
      }
    });

    it('forbids editing or deleting someone else’s message', async () => {
      const edit = await bob.agent.patch(`/api/messages/${message.id}`).send({ content: 'hax' });
      assert.equal(edit.status, 403);
      assert.equal((await bob.agent.delete(`/api/messages/${message.id}`)).status, 403);
    });

    it('lets the author delete', async () => {
      assert.equal((await alice.agent.delete(`/api/messages/${message.id}`)).status, 204);
      const res = await alice.agent.get(`/api/channels/${general.id}/messages`);
      assert.ok(!res.body.messages.some((m) => m.id === message.id));
    });

    it('returns 404 for missing messages', async () => {
      const edit = await alice.agent.patch(`/api/messages/${message.id}`).send({ content: 'x' });
      assert.equal(edit.status, 404);
      assert.equal((await alice.agent.delete(`/api/messages/${message.id}`)).status, 404);
      assert.equal((await alice.agent.delete('/api/messages/nope')).status, 404);
    });
  });
});
