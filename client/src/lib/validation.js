// Form checks built on the shared contract rules (@huddle/shared), so the client rejects exactly
// what the server would. The server stays authoritative. Each check returns an error or null.
import {
  validateChannelName,
  validateDisplayName,
  validatePassword,
  validateTopic,
  validateUsername,
} from '@huddle/shared';

export {
  CHANNEL_NAME_MAX,
  DISPLAY_NAME_MAX,
  MESSAGE_MAX,
  TOPIC_MAX,
  isBlank,
  normalizeChannelName,
} from '@huddle/shared';

const firstError = (...results) => results.find((r) => r.error)?.error ?? null;

export function validateRegistration({ username, password, displayName }) {
  return firstError(
    validateUsername(username),
    validatePassword(password),
    validateDisplayName(displayName, username),
  );
}

export function validateChannel({ name, topic }) {
  return firstError(validateChannelName(name), validateTopic(topic));
}
