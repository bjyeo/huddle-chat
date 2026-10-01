import { formatDay, isSameDay } from './time.js';

const GROUP_WINDOW_MS = 5 * 60 * 1000;

/**
 * Turns a sorted message list into render rows: a date divider whenever the day changes,
 * and `grouped: true` for consecutive messages by the same author within 5 minutes.
 */
export function groupMessages(messages) {
  const rows = [];
  let prev = null;
  for (const message of messages) {
    const newDay = !prev || !isSameDay(prev.createdAt, message.createdAt);
    if (newDay) {
      rows.push({ type: 'divider', key: `day-${message.id}`, label: formatDay(message.createdAt) });
    }
    const grouped =
      !newDay &&
      prev.author.id === message.author.id &&
      new Date(message.createdAt) - new Date(prev.createdAt) < GROUP_WINDOW_MS;
    rows.push({ type: 'message', key: message.id, message, grouped });
    prev = message;
  }
  return rows;
}
