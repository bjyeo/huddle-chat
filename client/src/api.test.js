import { describe, expect, it, vi } from 'vitest';
import * as api from './api.js';
import { mockFetch } from './test/fakes.js';

describe('api', () => {
  it('sends JSON with credentials and returns the parsed body', async () => {
    const user = { id: 1, username: 'alice', displayName: 'Alice' };
    const fetchMock = mockFetch({ 'POST /api/auth/login': [200, { user }] });

    await expect(api.login({ username: 'alice', password: 'secret123' })).resolves.toEqual({
      user,
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/auth/login');
    expect(init).toMatchObject({
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(JSON.parse(init.body)).toEqual({ username: 'alice', password: 'secret123' });
  });

  it('throws ApiError with the status and server message', async () => {
    mockFetch({ 'POST /api/channels': [409, { error: 'Channel already exists' }] });

    const error = await api.createChannel({ name: 'general' }).catch((e) => e);
    expect(error).toBeInstanceOf(api.ApiError);
    expect(error.status).toBe(409);
    expect(error.message).toBe('Channel already exists');
  });

  it('falls back to a generic message when the error body is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('oops', { status: 502 })),
    );
    await expect(api.getChannels()).rejects.toMatchObject({
      status: 502,
      message: 'Request failed (502)',
    });
  });

  it('maps network failures to ApiError with status 0', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(api.getHealth()).rejects.toMatchObject({ name: 'ApiError', status: 0 });
  });

  it('returns null for 204 responses', async () => {
    mockFetch({ 'DELETE /api/messages/5': [204] });
    await expect(api.deleteMessage(5)).resolves.toBeNull();
  });

  it('builds the pagination query string', async () => {
    const fetchMock = mockFetch({ 'GET /api/channels/3/messages': [200, { messages: [] }] });
    await api.getMessages(3, { before: 42, limit: 50 });
    await api.getMessages(3);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/channels/3/messages?before=42&limit=50',
      '/api/channels/3/messages',
    ]);
  });

  it('reports 401s on protected routes but not on auth routes', async () => {
    const onUnauthorized = vi.fn();
    api.setUnauthorizedHandler(onUnauthorized);
    mockFetch({
      'GET /api/users': [401, { error: 'Not authenticated' }],
      'POST /api/auth/login': [401, { error: 'Invalid username or password' }],
    });

    await expect(api.login({ username: 'a', password: 'b' })).rejects.toThrow(
      'Invalid username or password',
    );
    expect(onUnauthorized).not.toHaveBeenCalled();

    await expect(api.getUsers()).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).toHaveBeenCalledOnce();
    api.setUnauthorizedHandler(null);
  });
});
