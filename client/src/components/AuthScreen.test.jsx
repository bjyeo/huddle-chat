import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { io } from 'socket.io-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App.jsx';
import { AuthProvider } from '../hooks/useAuth.jsx';
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
    expect(fetchMock).toHaveBeenCalledTimes(1); // only the initial /me
  });
});
