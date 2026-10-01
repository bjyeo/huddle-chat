import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { DEFAULT_MAX_USERS } from '@huddle/shared';
import { loadConfig } from '../src/config.js';
import { startServer } from './helpers.js';

describe('GET /api/meta', () => {
  const servers = [];
  const start = async (overrides) => {
    const server = await startServer(overrides);
    servers.push(server);
    return server;
  };
  after(() => Promise.all(servers.map((server) => server.stop())));

  it('is public and reports the member cap without an invite code', async () => {
    const server = await start();
    const res = await server.request().get('/api/meta');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { maxUsers: 10, inviteRequired: false });
  });

  it('reflects MAX_USERS and INVITE_CODE', async () => {
    const server = await start({ maxUsers: 3, inviteCode: 'let-me-in' });
    const res = await server.request().get('/api/meta');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { maxUsers: 3, inviteRequired: true });
  });
});

describe('MAX_USERS default', () => {
  let config;
  before(() => (config = loadConfig({ JWT_SECRET: 'x'.repeat(64) })));

  it('matches the shared DEFAULT_MAX_USERS', () => {
    assert.equal(config.maxUsers, DEFAULT_MAX_USERS);
  });
});
