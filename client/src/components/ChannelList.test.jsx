import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChannelList } from './ChannelList.jsx';

const channel = (id, name, createdBy) => ({ id, name, topic: '', createdBy, createdAt: '' });

function renderList(channels, currentUserId = 1) {
  render(
    <ChannelList
      channels={channels}
      activeId={channels[0].id}
      unread={new Set()}
      currentUserId={currentUserId}
      onSelect={vi.fn()}
      onCreate={vi.fn()}
      onDelete={vi.fn()}
    />,
  );
}

const deleteButtonFor = (name) => screen.queryByRole('button', { name: `Delete channel ${name}` });

describe('ChannelList', () => {
  it('protects exactly the channels without a creator (createdBy === null)', () => {
    renderList([
      channel(1, 'general', null),
      channel(2, 'lobby', null), // seeded but not named "general": still protected
      channel(3, 'mine', 1),
      channel(4, 'theirs', 2),
    ]);

    expect(deleteButtonFor('general')).not.toBeInTheDocument();
    expect(deleteButtonFor('lobby')).not.toBeInTheDocument();
    expect(deleteButtonFor('mine')).toBeInTheDocument();
    expect(deleteButtonFor('theirs')).not.toBeInTheDocument();
  });

  it('does not special-case the name "general"', () => {
    renderList([channel(7, 'general', 1)]);
    expect(deleteButtonFor('general')).toBeInTheDocument();
  });
});
