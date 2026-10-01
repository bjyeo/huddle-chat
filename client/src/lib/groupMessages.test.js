import { describe, expect, it } from 'vitest';
import { makeMessage } from '../test/fakes.js';
import { groupMessages } from './groupMessages.js';

const alice = { id: 1, username: 'alice', displayName: 'Alice' };
const bob = { id: 2, username: 'bob', displayName: 'Bob' };

describe('groupMessages', () => {
  it('groups same-author messages within 5 minutes and adds day dividers', () => {
    const rows = groupMessages([
      makeMessage({ id: 1, author: alice, createdAt: '2026-09-30T12:00:00' }),
      makeMessage({ id: 2, author: alice, createdAt: '2026-10-01T12:00:00' }),
      makeMessage({ id: 3, author: alice, createdAt: '2026-10-01T12:04:59' }),
      makeMessage({ id: 4, author: alice, createdAt: '2026-10-01T12:10:00' }),
      makeMessage({ id: 5, author: bob, createdAt: '2026-10-01T12:10:30' }),
    ]);

    expect(rows.map((r) => (r.type === 'divider' ? 'day' : `${r.key}:${r.grouped}`))).toEqual([
      'day',
      '1:false',
      'day',
      '2:false',
      '3:true',
      '4:false',
      '5:false',
    ]);
  });
});
