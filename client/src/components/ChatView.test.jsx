import { render, screen } from '@testing-library/react';
import { io } from 'socket.io-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SocketProvider } from '../hooks/useSocket.jsx';
import { createFakeSocket, makeMessage, mockFetch } from '../test/fakes.js';
import { ChatView } from './ChatView.jsx';

vi.mock('socket.io-client', () => ({ io: vi.fn() }));

const general = { id: 1, name: 'general', topic: '', createdBy: null, createdAt: '' };
const games = { id: 2, name: 'games', topic: '', createdBy: 1, createdAt: '' };

describe('ChatView', () => {
  beforeEach(() => {
    io.mockImplementation(() => createFakeSocket());
  });

  it('replaces the previous channel instead of stacking it when switching channels', async () => {
    mockFetch({
      'GET /api/channels/1/messages': [200, { messages: [makeMessage({ content: 'in general' })] }],
      'GET /api/channels/2/messages': [
        200,
        { messages: [makeMessage({ channelId: 2, content: 'in games' })] },
      ],
    });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { rerender } = render(<ChatView channel={general} currentUserId={1} />, {
      wrapper: SocketProvider,
    });
    expect(await screen.findByText('in general')).toBeInTheDocument();

    rerender(<ChatView channel={games} currentUserId={1} />);
    expect(await screen.findByText('in games')).toBeInTheDocument();

    expect(screen.queryByText('in general')).not.toBeInTheDocument();
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(errors).not.toHaveBeenCalledWith(
      expect.stringContaining('same key'),
      expect.anything(),
      expect.anything(),
    );
  });
});
