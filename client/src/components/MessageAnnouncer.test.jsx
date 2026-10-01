import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { io } from 'socket.io-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BURST_MS, useMessageAnnouncements } from '../hooks/useMessageAnnouncements.js';
import { SocketProvider } from '../hooks/useSocket.jsx';
import { PAGE_SIZE } from '../lib/messagesReducer.js';
import { createFakeSocket, makeMessage, mockFetch } from '../test/fakes.js';
import { ChatView } from './ChatView.jsx';

vi.mock('socket.io-client', () => ({ io: vi.fn() }));

const general = { id: 1, name: 'general', topic: '', createdBy: null, createdAt: '' };
const me = { id: 1, username: 'me', displayName: 'Me' };
const alice = { id: 2, username: 'alice', displayName: 'Alice' };
const carol = { id: 3, username: 'carol', displayName: 'Carol' };

let socket;
const liveRegion = () => document.querySelector('[aria-live="polite"][aria-relevant="additions"]');

describe('MessageAnnouncer', () => {
  beforeEach(() => {
    io.mockImplementation(() => (socket = createFakeSocket()));
  });

  it("announces other people's new messages, but not history or your own", async () => {
    const latest = Array.from({ length: PAGE_SIZE }, (_, i) =>
      makeMessage({ id: 100 + i, author: alice, content: `history ${100 + i}` }),
    );
    const older = [makeMessage({ id: 7, author: alice, content: 'ancient history' })];
    let calls = 0;
    mockFetch({
      'GET /api/channels/1/messages': () => [200, { messages: calls++ === 0 ? latest : older }],
    });
    render(<ChatView channel={general} currentUserId={me.id} />, { wrapper: SocketProvider });
    expect(await screen.findByText('history 149')).toBeInTheDocument();

    const region = liveRegion();
    expect(region).toHaveClass('visually-hidden');
    expect(region).toBeEmptyDOMElement(); // the initial page is not announced

    await userEvent.click(screen.getByRole('button', { name: 'Load older messages' }));
    expect(await screen.findByText('ancient history')).toBeInTheDocument();
    expect(region).toBeEmptyDOMElement(); // nor is older history

    act(() =>
      socket.serverEmit('message:created', {
        message: makeMessage({ id: 200, author: me, content: 'my own words' }),
      }),
    );
    expect(region).toBeEmptyDOMElement(); // nor your own messages

    act(() =>
      socket.serverEmit('message:created', {
        message: makeMessage({ id: 201, channelId: 2, author: alice, content: 'elsewhere' }),
      }),
    );
    expect(region).toBeEmptyDOMElement(); // nor other channels

    act(() =>
      socket.serverEmit('message:created', {
        message: makeMessage({ id: 202, author: alice, content: 'hello' }),
      }),
    );
    expect(region).toHaveTextContent('Alice: hello');
    // The message list itself is unchanged: no live semantics that would re-read history.
    expect(screen.getByRole('list')).not.toHaveAttribute('aria-live');
  });

  it('collapses a burst into one summary and ignores duplicate deliveries', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useMessageAnnouncements(1, me.id), {
      wrapper: SocketProvider,
    });
    const emit = (message) => act(() => socket.serverEmit('message:created', { message }));

    const first = makeMessage({ id: 1, author: alice, content: 'first' });
    emit(first);
    expect(result.current.map((a) => a.text)).toEqual(['Alice: first']);

    emit(first); // duplicate broadcast
    emit(makeMessage({ id: 2, author: carol, content: 'second' }));
    emit(makeMessage({ id: 3, author: alice, content: '  third\n\nline ' }));
    expect(result.current).toHaveLength(1); // held back until the burst window ends

    act(() => vi.advanceTimersByTime(BURST_MS));
    expect(result.current.map((a) => a.text)).toEqual([
      'Alice: first',
      '2 new messages from Carol and Alice. Alice: third line',
    ]);

    // After a quiet window, the next message is announced immediately again.
    act(() => vi.advanceTimersByTime(BURST_MS));
    emit(makeMessage({ id: 4, author: carol, content: 'later' }));
    expect(result.current.at(-1).text).toBe('Carol: later');
  });
});
