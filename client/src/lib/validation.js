// Client-side mirrors of the rules in docs/API.md. The server stays authoritative.
export const MAX_MEMBERS = 10;
export const MESSAGE_MAX = 2000;
export const TOPIC_MAX = 120;
export const DISPLAY_NAME_MAX = 32;
export const CHANNEL_NAME_MAX = 32;

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const CHANNEL_RE = /^[a-z0-9-]{1,32}$/;

export function validateRegistration({ username, password, displayName }) {
  if (!USERNAME_RE.test(username)) {
    return 'Username must be 3–20 characters: letters, numbers or underscores.';
  }
  if (password.length < 8 || password.length > 128) {
    return 'Password must be 8–128 characters.';
  }
  if (displayName.trim().length > DISPLAY_NAME_MAX) {
    return `Display name must be at most ${DISPLAY_NAME_MAX} characters.`;
  }
  return null;
}

export function normalizeChannelName(name) {
  return name.trim().toLowerCase().replace(/\s+/g, '-');
}

export function validateChannel({ name, topic }) {
  if (!CHANNEL_RE.test(normalizeChannelName(name))) {
    return 'Channel names use 1–32 lowercase letters, numbers or dashes.';
  }
  if (topic.length > TOPIC_MAX) return `Topic must be at most ${TOPIC_MAX} characters.`;
  return null;
}
