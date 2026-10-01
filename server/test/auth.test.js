import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { PASSWORD, registerUser, sessionCookie, startServer } from './helpers.js';

describe('POST /api/auth/register', () => {
  let server;
  before(async () => (server = await startServer()));
  after(() => server.stop());

  it('creates the user, sets an httpOnly session cookie and hides the hash', async () => {
    const res = await server
      .request()
      .post('/api/auth/register')
      .send({ username: 'Alice', password: PASSWORD, displayName: '  Alice A.  ' });

    assert.equal(res.status, 201);
    assert.deepEqual(Object.keys(res.body.user).sort(), [
      'createdAt',
      'displayName',
      'id',
      'username',
    ]);
    assert.equal(res.body.user.username, 'Alice');
    assert.equal(res.body.user.displayName, 'Alice A.');
    assert.ok(!Number.isNaN(Date.parse(res.body.user.createdAt)));

    const cookie = res.headers['set-cookie'].find((c) => c.startsWith('token='));
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Lax/i);
    assert.match(cookie, /Path=\//);
    assert.doesNotMatch(cookie, /Secure/i);
    const payload = jwt.verify(sessionCookie(res).slice('token='.length), 'test-secret');
    assert.equal(payload.sub, res.body.user.id);
    assert.equal(payload.exp - payload.iat, 7 * 24 * 60 * 60);
  });

  it('defaults displayName to the username', async () => {
    const { user } = await registerUser(server, 'bob_99');
    assert.equal(user.displayName, 'bob_99');
  });

  it('rejects usernames that are taken case-insensitively with 409', async () => {
    const res = await server
      .request()
      .post('/api/auth/register')
      .send({ username: 'ALICE', password: PASSWORD });
    assert.equal(res.status, 409);
    assert.equal(typeof res.body.error, 'string');
  });

  for (const [label, body] of [
    ['missing body fields', {}],
    ['short username', { username: 'ab', password: PASSWORD }],
    ['long username', { username: 'a'.repeat(21), password: PASSWORD }],
    ['invalid username characters', { username: 'bad name!', password: PASSWORD }],
    ['short password', { username: 'carol', password: 'short' }],
    ['long password', { username: 'carol', password: 'x'.repeat(129) }],
    ['non-string password', { username: 'carol', password: 12345678 }],
    ['long displayName', { username: 'carol', password: PASSWORD, displayName: 'x'.repeat(33) }],
  ]) {
    it(`rejects ${label} with 400`, async () => {
      const res = await server.request().post('/api/auth/register').send(body);
      assert.equal(res.status, 400);
      assert.equal(typeof res.body.error, 'string');
    });
  }
});

describe('registration limits', () => {
  it('enforces MAX_USERS with 403', async () => {
    const server = await startServer({ maxUsers: 2 });
    try {
      await registerUser(server, 'one');
      await registerUser(server, 'two');
      const res = await server
        .request()
        .post('/api/auth/register')
        .send({ username: 'three', password: PASSWORD });
      assert.equal(res.status, 403);
      assert.equal(res.body.error, 'This server is full (max 2 members)');
    } finally {
      await server.stop();
    }
  });

  it('requires the invite code when INVITE_CODE is set', async () => {
    const server = await startServer({ inviteCode: 'let-me-in' });
    try {
      for (const inviteCode of [undefined, 'wrong']) {
        const res = await server
          .request()
          .post('/api/auth/register')
          .send({ username: 'dave', password: PASSWORD, inviteCode });
        assert.equal(res.status, 403);
        assert.equal(res.body.error, 'Invalid invite code');
      }
      await registerUser(server, 'dave', { inviteCode: 'let-me-in' });
    } finally {
      await server.stop();
    }
  });
});

describe('login, logout and /me', () => {
  let server;
  before(async () => {
    server = await startServer();
    await registerUser(server, 'Erin');
  });
  after(() => server.stop());

  it('logs in case-insensitively and sets the cookie', async () => {
    const agent = request.agent(server.url);
    const res = await agent.post('/api/auth/login').send({ username: 'erin', password: PASSWORD });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.username, 'Erin');
    assert.ok(sessionCookie(res));

    const me = await agent.get('/api/auth/me');
    assert.equal(me.status, 200);
    assert.deepEqual(me.body.user, res.body.user);
  });

  it('rejects a wrong password or unknown user with 401', async () => {
    for (const body of [
      { username: 'erin', password: 'wrong-password' },
      { username: 'nobody', password: PASSWORD },
    ]) {
      const res = await server.request().post('/api/auth/login').send(body);
      assert.equal(res.status, 401);
      assert.equal(res.body.error, 'Invalid username or password');
      assert.equal(sessionCookie(res), undefined);
    }
  });

  it('returns 401 from /me without a valid cookie', async () => {
    for (const cookie of [undefined, 'token=garbage', `token=${jwt.sign({ sub: 1 }, 'other')}`]) {
      const req = server.request().get('/api/auth/me');
      if (cookie) req.set('Cookie', cookie);
      const res = await req;
      assert.equal(res.status, 401);
      assert.equal(res.body.error, 'Not authenticated');
    }
  });

  it('returns 401 for a valid token of a user that no longer exists', async () => {
    const token = jwt.sign({ sub: 999 }, 'test-secret');
    const res = await server.request().get('/api/auth/me').set('Cookie', `token=${token}`);
    assert.equal(res.status, 401);
  });

  it('logout clears the cookie with 204', async () => {
    const agent = request.agent(server.url);
    await agent.post('/api/auth/login').send({ username: 'Erin', password: PASSWORD });
    const res = await agent.post('/api/auth/logout');
    assert.equal(res.status, 204);
    const cleared = res.headers['set-cookie'].find((c) => c.startsWith('token='));
    assert.match(cleared, /Expires=Thu, 01 Jan 1970/);
    assert.equal((await agent.get('/api/auth/me')).status, 401);
  });
});

describe('login rate limiting', () => {
  it('returns 429 after 10 failed attempts, even with the right password', async () => {
    const server = await startServer();
    try {
      await registerUser(server, 'frank');
      // Successful logins don't count towards the limit.
      for (let i = 0; i < 3; i++) {
        const ok = await server
          .request()
          .post('/api/auth/login')
          .send({ username: 'frank', password: PASSWORD });
        assert.equal(ok.status, 200);
      }
      for (let i = 0; i < 10; i++) {
        const res = await server
          .request()
          .post('/api/auth/login')
          .send({ username: 'frank', password: 'nope-nope' });
        assert.equal(res.status, 401);
      }
      const blocked = await server
        .request()
        .post('/api/auth/login')
        .send({ username: 'frank', password: PASSWORD });
      assert.equal(blocked.status, 429);
      assert.equal(typeof blocked.body.error, 'string');
      assert.ok(Number(blocked.headers['retry-after']) > 0);
    } finally {
      await server.stop();
    }
  });
});

describe('requireAuth', () => {
  let server;
  before(async () => (server = await startServer()));
  after(() => server.stop());

  for (const [method, path] of [
    ['get', '/api/users'],
    ['get', '/api/channels'],
    ['post', '/api/channels'],
    ['delete', '/api/channels/1'],
    ['get', '/api/channels/1/messages'],
    ['post', '/api/channels/1/messages'],
    ['patch', '/api/messages/1'],
    ['delete', '/api/messages/1'],
  ]) {
    it(`${method.toUpperCase()} ${path} → 401 without a session`, async () => {
      const res = await server.request()[method](path).send({});
      assert.equal(res.status, 401);
      assert.deepEqual(res.body, { error: 'Not authenticated' });
    });
  }
});
