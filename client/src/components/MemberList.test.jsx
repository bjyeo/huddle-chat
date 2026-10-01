import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetServerMeta } from '../hooks/useServerMeta.js';
import { mockFetch } from '../test/fakes.js';
import { MemberList } from './MemberList.jsx';

const member = (id, displayName, online) => ({
  id,
  username: displayName.toLowerCase(),
  displayName,
  createdAt: '2026-10-01T00:00:00Z',
  online,
});
const online = [member(1, 'Alice', true), member(2, 'Bob', true)];
const offline = [member(3, 'Carol', false)];

describe('MemberList', () => {
  beforeEach(() => resetServerMeta());

  it('shows the member cap the server reports', async () => {
    const fetchMock = mockFetch({
      'GET /api/meta': [200, { maxUsers: 20, inviteRequired: false }],
    });
    render(<MemberList online={online} offline={offline} currentUserId={1} />);

    expect(await screen.findByText('3 / 20 members')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('fetches /api/meta once per page, not once per mount', async () => {
    const fetchMock = mockFetch({ 'GET /api/meta': [200, { maxUsers: 4, inviteRequired: true }] });
    const { unmount } = render(<MemberList online={online} offline={[]} currentUserId={1} />);
    expect(await screen.findByText('2 / 4 members')).toBeInTheDocument();
    unmount();

    render(<MemberList online={online} offline={offline} currentUserId={1} />);
    expect(screen.getByText('3 / 4 members')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('shows just the count when /api/meta is unavailable', async () => {
    const fetchMock = mockFetch({}); // every route 404s
    render(<MemberList online={online} offline={offline} currentUserId={1} />);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(screen.getByText('3 members')).toBeInTheDocument();
  });
});
