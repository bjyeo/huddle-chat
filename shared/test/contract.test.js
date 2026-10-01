import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CHANNEL_NAME_RE,
  isProtectedChannel,
  normalizeChannelName,
  validateChannelName,
  validateContent,
  validateDisplayName,
  validatePassword,
  validateTopic,
  validateUsername,
} from '../src/index.js';

describe('normalizeChannelName', () => {
  it('trims, lowercases and dashes whitespace runs', () => {
    assert.equal(normalizeChannelName('  Off  Topic\tChat '), 'off-topic-chat');
    assert.equal(normalizeChannelName('random'), 'random');
  });

  it('returns an empty string for non-strings', () => {
    assert.equal(normalizeChannelName(undefined), '');
    assert.equal(normalizeChannelName(42), '');
  });
});

describe('validateChannelName', () => {
  it('returns the normalized name', () => {
    assert.deepEqual(validateChannelName(' Game Night '), { value: 'game-night' });
    assert.deepEqual(validateChannelName('x'.repeat(32)), { value: 'x'.repeat(32) });
  });

  for (const bad of ['', '   ', 'x'.repeat(33), 'no_underscores', 'émoji', null, 7]) {
    it(`rejects ${JSON.stringify(bad)}`, () => {
      assert.equal(typeof validateChannelName(bad).error, 'string');
    });
  }

  it('matches the documented pattern', () => {
    assert.equal(CHANNEL_NAME_RE.source, '^[a-z0-9-]{1,32}$');
  });
});

describe('user fields', () => {
  it('validates usernames', () => {
    assert.deepEqual(validateUsername('Alice_01'), { value: 'Alice_01' });
    assert.match(validateUsername('ab').error, /3–20 characters/);
    assert.match(validateUsername('a'.repeat(21)).error, /3–20 characters/);
    assert.match(validateUsername('no spaces').error, /letters, numbers and underscores/);
    assert.ok(validateUsername(undefined).error);
  });

  it('validates passwords by length only', () => {
    assert.deepEqual(validatePassword('12345678'), { value: '12345678' });
    assert.ok(validatePassword('1234567').error);
    assert.ok(validatePassword('x'.repeat(129)).error);
    assert.ok(validatePassword(12345678).error);
  });

  it('trims display names and falls back to the username', () => {
    assert.deepEqual(validateDisplayName('  Alice  ', 'alice'), { value: 'Alice' });
    assert.deepEqual(validateDisplayName('   ', 'alice'), { value: 'alice' });
    assert.deepEqual(validateDisplayName(undefined, 'alice'), { value: 'alice' });
    assert.ok(validateDisplayName('x'.repeat(33), 'alice').error);
    assert.ok(validateDisplayName(5, 'alice').error);
  });
});

describe('topic and content', () => {
  it('trims topics and caps them at 120 characters', () => {
    assert.deepEqual(validateTopic(undefined), { value: '' });
    assert.deepEqual(validateTopic(` ${'t'.repeat(120)} `), { value: 't'.repeat(120) });
    assert.ok(validateTopic('t'.repeat(121)).error);
  });

  it('requires 1–2000 characters of content after trimming', () => {
    assert.deepEqual(validateContent('  hi  '), { value: 'hi' });
    assert.deepEqual(validateContent('y'.repeat(2000)), { value: 'y'.repeat(2000) });
    assert.ok(validateContent('   ').error);
    assert.ok(validateContent('y'.repeat(2001)).error);
    assert.ok(validateContent(null).error);
  });
});

describe('isProtectedChannel', () => {
  it('protects exactly the channels without a creator', () => {
    assert.equal(isProtectedChannel({ name: 'general', createdBy: null }), true);
    assert.equal(isProtectedChannel({ name: 'lobby', createdBy: null }), true);
    assert.equal(isProtectedChannel({ name: 'general', createdBy: 3 }), false);
  });
});
