// Each validator returns `{ value }` on success or `{ error }` with a user-facing message.

const USERNAME_RE = /^[a-zA-Z0-9_]+$/;
const CHANNEL_NAME_RE = /^[a-z0-9-]{1,32}$/;

const isString = (v) => typeof v === 'string';
const isAbsent = (v) => v === undefined || v === null;

export function validateUsername(username) {
  if (!isString(username) || username.length < 3 || username.length > 20) {
    return { error: 'Username must be 3–20 characters' };
  }
  if (!USERNAME_RE.test(username)) {
    return { error: 'Username may only contain letters, numbers and underscores' };
  }
  return { value: username };
}

export function validatePassword(password) {
  if (!isString(password) || password.length < 8 || password.length > 128) {
    return { error: 'Password must be 8–128 characters' };
  }
  return { value: password };
}

/** An absent or blank display name falls back to the username. */
export function validateDisplayName(displayName, username) {
  if (isAbsent(displayName)) return { value: username };
  if (!isString(displayName)) return { error: 'Display name must be a string' };
  const trimmed = displayName.trim();
  if (trimmed.length === 0) return { value: username };
  if (trimmed.length > 32) return { error: 'Display name must be at most 32 characters' };
  return { value: trimmed };
}

export function normalizeChannelName(name) {
  if (!isString(name)) return { error: 'Channel name is required' };
  const normalized = name.trim().toLowerCase().replace(/\s+/g, '-');
  if (!CHANNEL_NAME_RE.test(normalized)) {
    return {
      error: 'Channel name must be 1–32 characters: lowercase letters, numbers and dashes',
    };
  }
  return { value: normalized };
}

export function validateTopic(topic) {
  if (isAbsent(topic)) return { value: '' };
  if (!isString(topic)) return { error: 'Topic must be a string' };
  const trimmed = topic.trim();
  if (trimmed.length > 120) return { error: 'Topic must be at most 120 characters' };
  return { value: trimmed };
}

export function validateContent(content) {
  if (!isString(content)) return { error: 'Message content is required' };
  const trimmed = content.trim();
  if (trimmed.length === 0) return { error: 'Message cannot be empty' };
  if (trimmed.length > 2000) return { error: 'Message must be at most 2000 characters' };
  return { value: trimmed };
}

/** Parses a positive integer id from a route/query param, or returns null. */
export function parseId(value) {
  if (!isString(value) || !/^[1-9]\d{0,15}$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}
