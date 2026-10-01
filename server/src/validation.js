// The field rules live in @huddle/shared so the client applies exactly the same ones.
// Each validator returns `{ value }` on success or `{ error }` with a user-facing message.
export {
  validateChannelName,
  validateContent,
  validateDisplayName,
  validatePassword,
  validateTopic,
  validateUsername,
} from '@huddle/shared';

/** Parses a positive integer id from a route/query param, or returns null. */
export function parseId(value) {
  if (typeof value !== 'string' || !/^[1-9]\d{0,15}$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}
