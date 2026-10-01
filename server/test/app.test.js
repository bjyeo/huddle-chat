import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { openDatabase } from '../src/db.js';
import { registerUser, startServer, testConfig } from './helpers.js';

describe('app', () => {
  let server;
  before(async () => (server = await startServer()));
  after(() => server.stop());

  it('GET /api/health', async () => {
    const res = await server.request().get('/api/health');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });
    assert.ok(res.headers['content-security-policy']);
    assert.equal(res.headers['x-powered-by'], undefined);
  });

  it('returns JSON 404 for unknown API routes', async () => {
    const res = await server.request().get('/api/nope');
    assert.equal(res.status, 404);
    assert.deepEqual(res.body, { error: 'Not found' });
  });

  it('returns 400 for malformed JSON and 413 for oversized bodies', async () => {
    const malformed = await server
      .request()
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"username":');
    assert.equal(malformed.status, 400);
    assert.equal(typeof malformed.body.error, 'string');

    const { agent } = await registerUser(server, 'bigsender');
    const big = await agent.post('/api/channels/1/messages').send({ content: 'x'.repeat(20_000) });
    assert.equal(big.status, 413);
    assert.equal(typeof big.body.error, 'string');
  });

  it('allows CORS with credentials only for CLIENT_ORIGIN', async () => {
    const ok = await server.request().get('/api/health').set('Origin', 'http://localhost:5173');
    assert.equal(ok.headers['access-control-allow-origin'], 'http://localhost:5173');
    assert.equal(ok.headers['access-control-allow-credentials'], 'true');
    const other = await server.request().get('/api/health').set('Origin', 'https://evil.example');
    assert.notEqual(other.headers['access-control-allow-origin'], 'https://evil.example');
  });
});

describe('production static serving', () => {
  let dir, db, close, app;
  before(() => {
    // A dot-directory in the path (e.g. ~/.apps/huddle) must not break serving.
    dir = fs.mkdtempSync(path.join(os.tmpdir(), '.huddle-dist-'));
    fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><div id="root"></div>');
    fs.writeFileSync(path.join(dir, 'app.js'), 'console.log(1)');
    db = openDatabase(':memory:');
    ({ app, close } = createApp({
      db,
      config: testConfig({ isProduction: true }),
      clientDist: dir,
    }));
  });
  after(async () => {
    await close();
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('serves assets and falls back to index.html for client routes', async () => {
    const asset = await request(app).get('/app.js');
    assert.equal(asset.status, 200);
    const spa = await request(app).get('/channels/3');
    assert.equal(spa.status, 200);
    assert.match(spa.text, /id="root"/);
  });

  it('keeps unknown /api routes as JSON 404s', async () => {
    const res = await request(app).get('/api/missing');
    assert.equal(res.status, 404);
    assert.deepEqual(res.body, { error: 'Not found' });
  });

  it('sets Secure on the session cookie', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'prod_user', password: 'password123' });
    assert.equal(res.status, 201);
    assert.match(res.headers['set-cookie'].join(';'), /Secure/);
  });
});

describe('config', () => {
  it('requires JWT_SECRET in production', () => {
    assert.throws(() => loadConfig({ NODE_ENV: 'production' }), /JWT_SECRET/);
  });

  it('applies defaults and parses overrides', () => {
    const config = loadConfig({ JWT_SECRET: 's', MAX_USERS: '3', DATABASE_PATH: ':memory:' });
    assert.equal(config.port, 3001);
    assert.equal(config.maxUsers, 3);
    assert.equal(config.databasePath, ':memory:');
    assert.equal(config.inviteCode, null);
    assert.equal(config.clientOrigin, 'http://localhost:5173');
    assert.equal(config.isProduction, false);
    assert.ok(path.isAbsolute(loadConfig({ JWT_SECRET: 's' }).databasePath));
  });

  it('rejects invalid numbers', () => {
    assert.throws(() => loadConfig({ JWT_SECRET: 's', MAX_USERS: 'ten' }), /MAX_USERS/);
  });
});

describe('database', () => {
  it('creates the file, seeds #general once and survives reopening', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'huddle-db-'));
    const file = path.join(dir, 'nested', 'huddle.db');
    try {
      openDatabase(file).close();
      const db = openDatabase(file);
      const rows = db.prepare("SELECT name FROM channels WHERE name = 'general'").all();
      assert.equal(rows.length, 1);
      assert.equal(db.prepare('PRAGMA journal_mode').get().journal_mode, 'wal');
      db.close();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
