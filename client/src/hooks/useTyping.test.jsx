import { act, renderHook } from '@testing-library/react';
import { TYPING_THROTTLE_MS } from '@huddle/shared';
import { io } from 'socket.io-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSocket } from '../test/fakes.js';
import { SocketProvider } from './useSocket.jsx';
import { TYPING_TTL_MS, useTyping } from './useTyping.js';

vi.mock('socket.io-client', () => ({ io: vi.fn() }));

const bob = { id: 2, displayName: 'Bob' };
const carol = { id: 3, displayName: 'Carol' };
let socket;

function renderTyping(channelId = 1) {
  return renderHook((props) => useTyping(props.channelId), {
    wrapper: SocketProvider,
    initialProps: { channelId },
  });
}

describe('useTyping', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    io.mockImplementation(() => (socket = createFakeSocket()));
  });

  it('expires each typer after the TTL, refreshed by new typing events', () => {
    const { result } = renderTyping();

    act(() => socket.serverEmit('typing', { channelId: 1, user: bob }));
    act(() => vi.advanceTimersByTime(TYPING_TTL_MS - 1000));
    act(() => socket.serverEmit('typing', { channelId: 1, user: carol }));
    act(() => socket.serverEmit('typing', { channelId: 1, user: bob }));
    act(() => socket.serverEmit('typing', { channelId: 2, user: { id: 4, displayName: 'Dan' } }));
    expect(result.current.typers).toEqual([bob, carol]);

    act(() => vi.advanceTimersByTime(TYPING_TTL_MS - 1));
    expect(result.current.typers).toEqual([bob, carol]);

    act(() => vi.advanceTimersByTime(1));
    expect(result.current.typers).toEqual([]);
  });

  it('clears typers when they post a message or the channel changes', () => {
    const { result, rerender } = renderTyping();

    act(() => socket.serverEmit('typing', { channelId: 1, user: bob }));
    act(() => socket.serverEmit('typing', { channelId: 1, user: carol }));
    act(() =>
      socket.serverEmit('message:created', { message: { id: 1, channelId: 1, author: bob } }),
    );
    expect(result.current.typers).toEqual([carol]);

    rerender({ channelId: 2 });
    expect(result.current.typers).toEqual([]);
  });

  it('throttles outgoing typing events to the shared TYPING_THROTTLE_MS', () => {
    vi.setSystemTime(new Date('2026-10-01T12:00:00Z'));
    const { result } = renderTyping();

    act(() => {
      result.current.notifyTyping();
      result.current.notifyTyping();
    });
    expect(socket.emit).toHaveBeenCalledTimes(1);
    expect(socket.emit).toHaveBeenCalledWith('typing', { channelId: 1 });

    act(() => vi.advanceTimersByTime(TYPING_THROTTLE_MS - 1));
    act(() => result.current.notifyTyping());
    expect(socket.emit).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(1));
    act(() => result.current.notifyTyping());
    expect(socket.emit).toHaveBeenCalledTimes(2);
  });

  it('keeps typers visible across several throttle windows', () => {
    expect(TYPING_TTL_MS).toBeGreaterThanOrEqual(2 * TYPING_THROTTLE_MS);
  });
});
