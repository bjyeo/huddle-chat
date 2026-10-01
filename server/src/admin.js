// Operator tasks run from the command line (see server/scripts/).
import { createStore } from './store.js';

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

/**
 * Removes a member by username (case-insensitive) to free their slot: their messages and
 * sessions are deleted, channels they created stay without an owner. Returns a summary, or null
 * when no such user exists.
 */
export function removeUser(db, username) {
  const store = createStore(db);
  const user = store.findUserByUsername(username);
  const removed = user && store.removeUser(user.id);
  if (!removed) return null;
  return { ...removed, remainingUsers: store.countUsers() };
}

/** Human-readable report of what removeUser did. */
export function describeRemoval({ user, messages, sessions, channels, remainingUsers }) {
  const lines = [
    `Removed user "${user.username}" (id ${user.id}, display name "${user.displayName}").`,
    `- deleted ${plural(messages, 'message')}`,
    `- revoked ${plural(sessions, 'session')} (open sockets drop within a minute)`,
  ];
  if (channels > 0) {
    lines.push(`- kept ${plural(channels, 'channel')} they created, now with no owner`);
  }
  lines.push(`${plural(remainingUsers, 'member')} left.`);
  return lines.join('\n');
}
