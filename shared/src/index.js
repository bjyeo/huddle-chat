// The rules from docs/API.md, imported by both server/ and client/ so they can't drift apart.
// Plain ESM with no dependencies and no build step: Node and Vite both load it as-is.
// The server stays authoritative; the client uses the same checks for instant feedback.

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const USERNAME_RE = /^[a-zA-Z0-9_]+$/;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
export const DISPLAY_NAME_MAX = 32;
export const CHANNEL_NAME_MAX = 32;
export const CHANNEL_NAME_RE = new RegExp(`^[a-z0-9-]{1,${CHANNEL_NAME_MAX}}$`);
export const TOPIC_MAX = 120;
export const MESSAGE_MAX = 2000;
export const MAX_CHANNELS = 50;

/** Default registered-user cap; the server's real value comes from env `MAX_USERS` (GET /api/meta). */
export const DEFAULT_MAX_USERS = 10;

/**
 * The server relays at most one `typing` event per socket per channel in this window and drops
 * the rest; the client must not emit more often than this.
 */
export const TYPING_THROTTLE_MS = 1000;

const isString = (v) => typeof v === 'string';
const isAbsent = (v) => v === undefined || v === null;
// trim() leaves zero-width spaces, joiners, bidi marks, Hangul fillers etc., so a string of only
// those would pass as non-empty yet render blank.
const BLANK_RE = /^[\s\p{Default_Ignorable_Code_Point}]*$/u;
const isBlank = (s) => BLANK_RE.test(s);

/** Trim, lowercase, whitespace runs → `-`. Doesn't validate; see validateChannelName. */
export function normalizeChannelName(name) {
  return isString(name) ? name.trim().toLowerCase().replace(/\s+/g, '-') : '';
}

/** Seeded channels (#general) have no creator and can never be deleted. */
export function isProtectedChannel(channel) {
  return channel.createdBy === null;
}

// Each validator returns `{ value }` (the cleaned value) on success or `{ error }` with a
// user-facing message.

export function validateUsername(username) {
  if (!isString(username) || username.length < USERNAME_MIN || username.length > USERNAME_MAX) {
    return { error: `Username must be ${USERNAME_MIN}–${USERNAME_MAX} characters` };
  }
  if (!USERNAME_RE.test(username)) {
    return { error: 'Username may only contain letters, numbers and underscores' };
  }
  return { value: username };
}

export function validatePassword(password) {
  if (!isString(password) || password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    return { error: `Password must be ${PASSWORD_MIN}–${PASSWORD_MAX} characters` };
  }
  return { value: password };
}

/** An absent or blank display name falls back to the username. */
export function validateDisplayName(displayName, username) {
  if (isAbsent(displayName)) return { value: username };
  if (!isString(displayName)) return { error: 'Display name must be a string' };
  const trimmed = displayName.trim();
  if (isBlank(trimmed)) return { value: username };
  if (trimmed.length > DISPLAY_NAME_MAX) {
    return { error: `Display name must be at most ${DISPLAY_NAME_MAX} characters` };
  }
  return { value: trimmed };
}

/** Normalizes then validates a channel name; `value` is the normalized name. */
export function validateChannelName(name) {
  if (!isString(name)) return { error: 'Channel name is required' };
  const normalized = normalizeChannelName(name);
  if (!CHANNEL_NAME_RE.test(normalized)) {
    return {
      error: `Channel name must be 1–${CHANNEL_NAME_MAX} characters: lowercase letters, numbers and dashes`,
    };
  }
  return { value: normalized };
}

export function validateTopic(topic) {
  if (isAbsent(topic)) return { value: '' };
  if (!isString(topic)) return { error: 'Topic must be a string' };
  const trimmed = topic.trim();
  if (isBlank(trimmed)) return { value: '' };
  if (trimmed.length > TOPIC_MAX) return { error: `Topic must be at most ${TOPIC_MAX} characters` };
  return { value: trimmed };
}

export function validateContent(content) {
  if (!isString(content)) return { error: 'Message content is required' };
  const trimmed = content.trim();
  if (isBlank(trimmed)) return { error: 'Message cannot be empty' };
  if (trimmed.length > MESSAGE_MAX) {
    return { error: `Message must be at most ${MESSAGE_MAX} characters` };
  }
  return { value: trimmed };
}
