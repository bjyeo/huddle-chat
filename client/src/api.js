export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

let unauthorizedHandler = null;

/** Called when a non-auth request gets a 401 (e.g. the session cookie expired). */
export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler;
}

async function request(path, { method = 'GET', body } = {}) {
  const init = { method, credentials: 'include' };
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(`/api${path}`, init);
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection.');
  }

  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/')) unauthorizedHandler?.();
    throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`);
  }
  return data;
}

export const getHealth = () => request('/health');

export const register = ({ username, password, displayName, inviteCode }) =>
  request('/auth/register', {
    method: 'POST',
    body: { username, password, displayName, inviteCode },
  });
export const login = ({ username, password }) =>
  request('/auth/login', { method: 'POST', body: { username, password } });
export const logout = () => request('/auth/logout', { method: 'POST' });
export const getMe = () => request('/auth/me');

export const getUsers = () => request('/users');

export const getChannels = () => request('/channels');
export const createChannel = ({ name, topic }) =>
  request('/channels', { method: 'POST', body: { name, topic } });
export const deleteChannel = (id) => request(`/channels/${id}`, { method: 'DELETE' });

export function getMessages(channelId, { before, limit } = {}) {
  const params = new URLSearchParams();
  if (before != null) params.set('before', before);
  if (limit != null) params.set('limit', limit);
  const query = params.size ? `?${params}` : '';
  return request(`/channels/${channelId}/messages${query}`);
}
export const sendMessage = (channelId, content) =>
  request(`/channels/${channelId}/messages`, { method: 'POST', body: { content } });
export const editMessage = (id, content) =>
  request(`/messages/${id}`, { method: 'PATCH', body: { content } });
export const deleteMessage = (id) => request(`/messages/${id}`, { method: 'DELETE' });
