import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { io } from 'socket.io-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App.jsx';
import { AuthProvider } from '../hooks/useAuth.jsx';
import { resetServerMeta } from '../hooks/useServerMeta.js';
import { createFakeSocket, mockFetch } from '../test/fakes.js';

vi.mock('socket.io-client', () => ({ io: vi.fn() }));

const alice = { id: 1, username: 'alice', displayName: 'Alice', createdAt: '2026-10-01T00:00:00Z' };
const general = { id: 1, name: 'general', topic: 'Say hi!', createdBy: null, createdAt: '' };

function renderApp() {
  return render(
    <AuthProvider>
      <App />
    </AuthProvider>,
  );
}

describe('auth flow', () => {
  beforeEach(() => {
    resetServerMeta();
    io.mockImplementation(() => createFakeSocket());
  });

  it('shows the server error on a failed login, then logs in and opens the chat', async () => {
    const user = userEvent.setup();
    let attempts = 0;
    let resolveLogin;
    const fetchMock = mockFetch({
      'GET /api/auth/me': [401, { error: 'Not authenticated' }],
      'POST /api/auth/login': () =>
        ++attempts === 1
          ? [401, { error: 'Invalid username or password' }]
          : [200, { user: alice }],
      'GET /api/channels': [200, { channels: [general] }],
      'GET /api/users': [200, { users: [{ ...alice, online: true }] }],
      'GET /api/channels/1/messages': [200, { messages: [] }],
    });

    renderApp();
    await user.type(await screen.findByLabelText('Username'), 'alice');
    await user.type(screen.getByLabelText('Password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid username or password');
    expect(screen.getByLabelText('Username')).toHaveValue('alice');

    // Hold the second login open to observe the pending state.
    const realFetch = fetchMock.getMockImplementation();
    fetchMock.mockImplementationOnce(
      (url, init) => new Promise((resolve) => (resolveLogin = () => resolve(realFetch(url, init)))),
    );
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(screen.getByRole('button', { name: 'Please wait…' })).toBeDisabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    resolveLogin();
    expect(await screen.findByRole('heading', { name: /general/ })).toBeInTheDocument();
    expect(await screen.findByText('Welcome to #general!')).toBeInTheDocument();
    expect(io).toHaveBeenCalledWith({ withCredentials: true });
  });

  it('validates registration fields before calling the server', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch({ 'GET /api/auth/me': [401, { error: 'Not authenticated' }] });

    renderApp();
    await user.click(await screen.findByRole('button', { name: 'Register' }));
    expect(screen.getByRole('heading', { name: 'Create an account' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Invite code/)).toBeInTheDocument();

    await user.type(screen.getByLabelText('Username'), 'a!');
    await user.type(screen.getByLabelText('Password'), 'longenough');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(screen.getByRole('alert')).toHaveTextContent(/3–20 characters/);
    const urls = fetchMock.mock.calls.map(([url]) => url);
    expect(urls).not.toContain('/api/auth/register');
  });
});

describe('registration uses the server settings from /api/meta', () => {
  beforeEach(() => resetServerMeta());

  const openRegister = async (meta) => {
    const user = userEvent.setup();
    const fetchMock = mockFetch({
      'GET /api/auth/me': [401, { error: 'Not authenticated' }],
      'GET /api/meta': meta,
      'POST /api/auth/register': [403, { error: 'Invalid invite code' }],
    });
    renderApp();
    await user.click(await screen.findByRole('button', { name: 'Register' }));
    return { user, fetchMock };
  };

  it('shows the runtime member cap and hides the invite code when none is required', async () => {
    await openRegister([200, { maxUsers: 25, inviteRequired: false }]);
    expect(await screen.findByText('Join your Huddle — up to 25 members.')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Invite code/)).not.toBeInTheDocument();
  });

  it('requires the invite code when the server does', async () => {
    const { user, fetchMock } = await openRegister([200, { maxUsers: 5, inviteRequired: true }]);
    expect(await screen.findByText('Join your Huddle — up to 5 members.')).toBeInTheDocument();
    const invite = screen.getByLabelText('Invite code');
    expect(invite).toBeRequired();

    await user.type(screen.getByLabelText('Username'), 'carol');
    await user.type(screen.getByLabelText('Password'), 'longenough');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter your invite code.');

    await user.type(invite, 'wrong');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid invite code');
    const [, init] = fetchMock.mock.calls.find(([url]) => url === '/api/auth/register');
    expect(JSON.parse(init.body)).toMatchObject({ username: 'carol', inviteCode: 'wrong' });
  });

  it('falls back to no cap and an optional invite code when /api/meta fails', async () => {
    const { fetchMock } = await openRegister([500, { error: 'Internal server error' }]);
    await vi.waitFor(() => expect(fetchMock.mock.calls.map(([url]) => url)).toContain('/api/meta'));
    expect(screen.getByText('Join your Huddle.')).toBeInTheDocument();
    expect(screen.getByLabelText(/Invite code \(optional\)/)).not.toBeRequired();
  });
});
