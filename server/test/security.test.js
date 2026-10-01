import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { loadConfig } from '../src/config.js';
import { openDatabase } from '../src/db.js';
import {
  PASSWORD,
  connectSocket,
  issueTestToken,
  registerUser,
  sessionCookie,
  startServer,
} from './helpers.js';

const STRONG_SECRET = 'f3a9c1e07b5d42869e1fa0c3b7d2e5948a6c0f1e3b5d7a9c';
const prod = (env) => loadConfig({ NODE_ENV: 'production', ...env });

describe('production config', () => {
  for (const secret of [
    'change-me',
    'CHANGE-ME',
    'changeme',
    'Change_Me',
    'secret',
    'Password',
    'jwt-secret',
    'JWT_SECRET',
    'your-secret',
    'your-secret-key-here-please-replace-it-now', // long, but still a template value
    'replace-me-with-a-long-random-value-1234567890',
  ]) {
    it(`rejects the placeholder JWT_SECRET "${secret}"`, () => {
      assert.throws(
        () => prod({ JWT_SECRET: secret, INVITE_CODE: 'x' }),
        /JWT_SECRET.*placeholder/,
      );
    });
  }

  it('rejects secrets shorter than 32 characters', () => {
    assert.throws(
      () => prod({ JWT_SECRET: STRONG_SECRET.slice(0, 31), INVITE_CODE: 'x' }),
      /JWT_SECRET is shorter than 32 characters/,
    );
  });

  it('rejects long secrets with almost no variety', () => {
    assert.throws(() => prod({ JWT_SECRET: 'ab'.repeat(32), INVITE_CODE: 'x' }), /JWT_SECRET/);
  });

  it('explains how to generate a secret', () => {
    assert.throws(() => prod({ JWT_SECRET: 'change-me', INVITE_CODE: 'x' }), /randomBytes/);
  });

  it('accepts a strong secret', () => {
    const config = prod({ JWT_SECRET: STRONG_SECRET, INVITE_CODE: 'let-me-in' });
    assert.equal(config.jwtSecret, STRONG_SECRET);
    assert.equal(config.inviteCode, 'let-me-in');
    assert.equal(config.allowOpenRegistration, false);
  });

  it('requires INVITE_CODE unless ALLOW_OPEN_REGISTRATION=true', () => {
    assert.throws(() => prod({ JWT_SECRET: STRONG_SECRET }), /INVITE_CODE is required/);
    assert.throws(
      () => prod({ JWT_SECRET: STRONG_SECRET, ALLOW_OPEN_REGISTRATION: 'false' }),
      /INVITE_CODE/,
    );
    const open = prod({ JWT_SECRET: STRONG_SECRET, ALLOW_OPEN_REGISTRATION: 'true' });
    assert.equal(open.inviteCode, null);
    assert.equal(open.allowOpenRegistration, true);
  });

  it('rejects ALLOW_OPEN_REGISTRATION values other than true/false', () => {
    assert.throws(
      () => prod({ JWT_SECRET: STRONG_SECRET, ALLOW_OPEN_REGISTRATION: 'yes' }),
      /ALLOW_OPEN_REGISTRATION/,
    );
  });

  it('leaves development unchanged: any secret, no invite code needed', () => {
    const config = loadConfig({ JWT_SECRET: 'change-me' });
    assert.equal(config.jwtSecret, 'change-me');
    assert.equal(config.inviteCode, null);
  });
});

describe('server-side sessions', () => {
  let server, erin;
  const count = (sql, ...params) => server.db.prepare(sql).get(...params).n;
  const tokenOf = (cookie) => cookie.slice('token='.length);
  const me = (token) => server.request().get('/api/auth/me').set('Cookie', `token=${token}`);
  const sockets = [];

  before(async () => {
    server = await startServer();
    erin = await registerUser(server, 'erin');
  });
  afterEach(() => {
    for (const socket of sockets.splice(0)) socket.disconnect();
  });
  after(() => server.stop());

  const login = async () => {
    const agent = request.agent(server.url);
    const res = await agent.post('/api/auth/login').send({ username: 'erin', password: PASSWORD });
    assert.equal(res.status, 200);
    return { agent, token: tokenOf(sessionCookie(res)) };
  };

  it('stores a session row keyed by the token jti on register and login', async () => {
    const registered = jwt.decode(tokenOf(erin.cookie));
    const { token } = await login();
    const loggedIn = jwt.decode(token);
    assert.notEqual(registered.jti, loggedIn.jti);
    for (const { jti, exp } of [registered, loggedIn]) {
      const row = server.db.prepare('SELECT * FROM sessions WHERE jti = ?').get(jti);
      assert.equal(row.user_id, erin.user.id);
      assert.equal(Date.parse(row.expires_at), exp * 1000);
    }
  });

  it('rejects a token copied before logout on REST and on new socket handshakes', async () => {
    const { agent, token: copied } = await login();
    const other = await login(); // another device stays logged in
    assert.equal((await me(copied)).status, 200);

    assert.equal((await agent.post('/api/auth/logout')).status, 204);

    const res = await me(copied);
    assert.equal(res.status, 401);
    assert.deepEqual(res.body, { error: 'Not authenticated' });
    await assert.rejects(connectSocket(server, { cookie: `token=${copied}` }), {
      message: 'Not authenticated',
    });
    await assert.rejects(connectSocket(server, { auth: { token: copied } }), {
      message: 'Not authenticated',
    });

    assert.equal((await me(other.token)).status, 200);
    const socket = await connectSocket(server, { cookie: `token=${other.token}` });
    sockets.push(socket);
    assert.ok(socket.connected);
  });

  it('rejects tokens without exp, without jti, with an unknown jti or another user’s jti', async () => {
    const { token } = await login();
    const { jti } = jwt.decode(token);
    const secret = server.config.jwtSecret;
    const sub = erin.user.id;
    const bob = await registerUser(server, 'bob');

    const forged = {
      'no exp': jwt.sign({ sub, jti }, secret, { algorithm: 'HS256' }),
      'no jti': jwt.sign({ sub }, secret, { algorithm: 'HS256', expiresIn: '7d' }),
      'unknown jti': jwt.sign({ sub, jti: 'not-a-session' }, secret, { expiresIn: '7d' }),
      'another user’s jti': jwt.sign({ sub: bob.user.id, jti }, secret, { expiresIn: '7d' }),
      'non-HS256 algorithm': jwt.sign({ sub, jti }, secret, {
        algorithm: 'HS512',
        expiresIn: '7d',
      }),
    };
    for (const [label, forgedToken] of Object.entries(forged)) {
      assert.equal((await me(forgedToken)).status, 401, label);
      await assert.rejects(connectSocket(server, { auth: { token: forgedToken } }), label);
    }
    // The genuine token is still fine.
    assert.equal((await me(token)).status, 200);
  });

  it('rejects a session whose row has expired', async () => {
    const token = issueTestToken(server, erin.user.id, { ttlSeconds: 60 });
    assert.equal((await me(token)).status, 200);
    const { jti } = jwt.decode(token);
    server.db
      .prepare('UPDATE sessions SET expires_at = ? WHERE jti = ?')
      .run(new Date(Date.now() - 1000).toISOString(), jti);
    assert.equal((await me(token)).status, 401);
  });

  it('deletes expired sessions when someone logs in', async () => {
    issueTestToken(server, erin.user.id, { ttlSeconds: -60 });
    const expired = 'SELECT COUNT(*) AS n FROM sessions WHERE expires_at <= ?';
    assert.ok(count(expired, new Date().toISOString()) > 0);
    await login();
    assert.equal(count(expired, new Date().toISOString()), 0);
  });

  it('deletes the session row on logout', async () => {
    const { agent, token } = await login();
    const { jti } = jwt.decode(token);
    await agent.post('/api/auth/logout');
    assert.equal(count('SELECT COUNT(*) AS n FROM sessions WHERE jti = ?', jti), 0);
  });
});

describe('registration rate limiting', () => {
  const register = (server, username, { forwardedFor, password = PASSWORD } = {}) => {
    const req = server.request().post('/api/auth/register');
    if (forwardedFor) req.set('X-Forwarded-For', forwardedFor);
    return req.send({ username, password });
  };

  it('allows 5 attempts per IP per hour, counting successes and failures', async () => {
    // undefined → the production default limit.
    const server = await startServer({ registerRateLimit: undefined });
    try {
      assert.equal((await register(server, 'user_1')).status, 201);
      assert.equal((await register(server, 'user_2')).status, 201);
      assert.equal((await register(server, 'user_3', { password: 'short' })).status, 400);
      assert.equal((await register(server, 'user_1')).status, 409);
      assert.equal((await register(server, 'user_5')).status, 201);

      const blocked = await register(server, 'user_6');
      assert.equal(blocked.status, 429);
      assert.equal(blocked.body.error, 'Too many registration attempts, try again later');
      const retryAfter = Number(blocked.headers['retry-after']);
      assert.ok(retryAfter > 3500 && retryAfter <= 3600, String(retryAfter));
      assert.equal(sessionCookie(blocked), undefined);
    } finally {
      await server.stop();
    }
  });

  it('limits per client IP behind a trusted proxy', async () => {
    const server = await startServer({ registerRateLimit: undefined, trustProxy: 1 });
    try {
      for (let i = 0; i < 5; i++) {
        await register(server, `bad name ${i}`, { forwardedFor: '203.0.113.1' });
      }
      const blocked = await register(server, 'alice', { forwardedFor: '203.0.113.1' });
      assert.equal(blocked.status, 429);
      const other = await register(server, 'alice', { forwardedFor: '203.0.113.2' });
      assert.equal(other.status, 201);
    } finally {
      await server.stop();
    }
  });

  it('lets a whole group with the invite code sign up from one IP', async () => {
    const server = await startServer({ registerRateLimit: undefined, inviteCode: 'let-me-in' });
    try {
      for (let i = 1; i <= 10; i++) {
        const res = await server
          .request()
          .post('/api/auth/register')
          .send({ username: `member_${i}`, password: PASSWORD, inviteCode: 'let-me-in' });
        assert.equal(res.status, 201, `member_${i}: ${res.text}`);
      }
    } finally {
      await server.stop();
    }
  });
});

describe('sessions table migration', () => {
  it('is created when opening a database file from before it existed', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'huddle-db-'));
    const file = path.join(dir, 'huddle.db');
    try {
      const old = openDatabase(file);
      old.exec('DROP TABLE sessions');
      old.close();
      const db = openDatabase(file);
      const table = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sessions'")
        .get();
      assert.equal(table?.name, 'sessions');
      db.close();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
