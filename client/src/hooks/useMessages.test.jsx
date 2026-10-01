import { act, renderHook, waitFor } from '@testing-library/react';
import { io } from 'socket.io-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PAGE_SIZE } from '../lib/messagesReducer.js';
import { createFakeSocket, makeMessage, mockFetch } from '../test/fakes.js';
import { useMessages } from './useMessages.js';
import { SocketProvider } from './useSocket.jsx';

vi.mock('socket.io-client', () => ({ io: vi.fn() }));

let socket;

async function renderMessages(channelId = 1) {
  const hook = renderHook((props) => useMessages(props.channelId), {
    wrapper: SocketProvider,
    initialProps: { channelId },
  });
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
}

describe('useMessages', () => {
  beforeEach(() => {
    io.mockImplementation(() => (socket = createFakeSocket()));
  });

  it('dedupes the socket broadcast of a message it just sent and ignores other channels', async () => {
    const existing = makeMessage({ id: 1 });
    const sent = makeMessage({
      id: 2,
      content: 'hello',
      author: { id: 1, username: 'alice', displayName: 'Alice' },
    });
    mockFetch({
      'GET /api/channels/1/messages': [200, { messages: [existing] }],
      'POST /api/channels/1/messages': [201, { message: sent }],
    });
    const { result } = await renderMessages();

    await act(() => result.current.send('hello'));
    act(() => socket.serverEmit('message:created', { message: sent }));
    act(() =>
      socket.serverEmit('message:created', { message: makeMessage({ id: 3, channelId: 2 }) }),
    );

    expect(result.current.messages.map((m) => m.id)).toEqual([1, 2]);
  });

  it('applies live updates and deletes for its own channel only', async () => {
    const message = makeMessage({ id: 10 });
    mockFetch({ 'GET /api/channels/1/messages': [200, { messages: [message] }] });
    const { result } = await renderMessages();

    act(() => socket.serverEmit('message:created', { message: makeMessage({ id: 11 }) }));
    act(() =>
      socket.serverEmit('message:updated', {
        message: { ...message, content: 'edited', editedAt: '2026-10-01T12:01:00.000Z' },
      }),
    );
    act(() => socket.serverEmit('message:deleted', { id: 11, channelId: 2 }));
    expect(result.current.messages.map((m) => [m.id, m.content])).toEqual([
      [10, 'edited'],
      [11, 'message 11'],
    ]);

    act(() => socket.serverEmit('message:deleted', { id: 11, channelId: 1 }));
    expect(result.current.messages.map((m) => m.id)).toEqual([10]);
  });

  it('loads older pages with `before` and tracks hasMore', async () => {
    const latest = Array.from({ length: PAGE_SIZE }, (_, i) => makeMessage({ id: 100 + i }));
    const older = [makeMessage({ id: 7 }), makeMessage({ id: 8 })];
    const fetchMock = mockFetch({
      'GET /api/channels/1/messages': () => [
        200,
        { messages: fetchMock.mock.calls.length === 1 ? latest : older },
      ],
    });
    const { result } = await renderMessages();
    expect(result.current.hasMore).toBe(true);

    await act(() => result.current.loadOlder());

    expect(fetchMock.mock.calls.at(-1)[0]).toBe('/api/channels/1/messages?before=100&limit=50');
    expect(result.current.messages[0].id).toBe(7);
    expect(result.current.messages).toHaveLength(PAGE_SIZE + 2);
    expect(result.current.hasMore).toBe(false);
  });

  it('re-fetches after a socket reconnect so missed changes appear', async () => {
    let serverMessages = [makeMessage({ id: 1 }), makeMessage({ id: 2 })];
    const fetchMock = mockFetch({
      'GET /api/channels/1/messages': () => [200, { messages: serverMessages }],
    });
    const { result } = await renderMessages();

    act(() => socket.serverEmit('connect'));
    expect(fetchMock).toHaveBeenCalledTimes(1); // the first connect is not a reconnect

    serverMessages = [makeMessage({ id: 2, content: 'edited' }), makeMessage({ id: 3 })];
    act(() => socket.serverEmit('disconnect'));
    act(() => socket.serverEmit('connect'));

    await waitFor(() =>
      expect(result.current.messages.map((m) => [m.id, m.content])).toEqual([
        [2, 'edited'],
        [3, 'message 3'],
      ]),
    );
  });

  it('switches channels without leaking the previous channel', async () => {
    mockFetch({
      'GET /api/channels/1/messages': [200, { messages: [makeMessage({ id: 1 })] }],
      'GET /api/channels/2/messages': [200, { messages: [makeMessage({ id: 5, channelId: 2 })] }],
    });
    const { result, rerender } = await renderMessages(1);

    rerender({ channelId: 2 });
    expect(result.current.messages).toEqual([]);
    await waitFor(() => expect(result.current.messages.map((m) => m.id)).toEqual([5]));
  });
});
