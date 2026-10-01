import { act, renderHook, waitFor } from '@testing-library/react';
import { io } from 'socket.io-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSocket } from '../test/fakes.js';
import { SocketProvider, useSocket } from './useSocket.jsx';

vi.mock('socket.io-client', () => ({ io: vi.fn() }));

let socket;

function renderSocket(onAuthLost) {
  return renderHook(() => useSocket(), {
    wrapper: ({ children }) => <SocketProvider onAuthLost={onAuthLost}>{children}</SocketProvider>,
  });
}

describe('SocketProvider', () => {
  beforeEach(() => {
    io.mockImplementation(() => (socket = createFakeSocket()));
  });

  it('asks whether the session is still valid when the server ends the socket', async () => {
    const onAuthLost = vi.fn().mockResolvedValue(false);
    const { result } = renderSocket(onAuthLost);

    act(() => socket.serverEmit('disconnect', 'io server disconnect'));

    await waitFor(() => expect(onAuthLost).toHaveBeenCalledTimes(1));
    expect(result.current.status).toBe('disconnected');
    expect(socket.connect).not.toHaveBeenCalled();
  });

  it('reconnects if the session turns out to be valid', async () => {
    const onAuthLost = vi.fn().mockResolvedValue(true);
    renderSocket(onAuthLost);

    act(() => socket.serverEmit('connect_error', new Error('Not authenticated')));

    await waitFor(() => expect(socket.connect).toHaveBeenCalledTimes(1));
  });

  it('leaves ordinary network drops to socket.io’s own reconnection', () => {
    const onAuthLost = vi.fn();
    renderSocket(onAuthLost);

    act(() => socket.serverEmit('disconnect', 'transport close'));
    act(() => socket.serverEmit('connect_error', new Error('xhr poll error')));

    expect(onAuthLost).not.toHaveBeenCalled();
  });
});
