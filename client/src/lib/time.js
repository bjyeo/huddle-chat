const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'long' });
const fullFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'full', timeStyle: 'short' });

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function isSameDay(a, b) {
  return startOfDay(new Date(a)) === startOfDay(new Date(b));
}

export function formatTime(iso) {
  return timeFormat.format(new Date(iso));
}

export function formatFull(iso) {
  return fullFormat.format(new Date(iso));
}

export function formatDay(iso, now = new Date()) {
  const diff = Math.round((startOfDay(now) - startOfDay(new Date(iso))) / DAY_MS);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return dateFormat.format(new Date(iso));
}

/** "Today at 3:04 PM", "Yesterday at …" or "October 1, 2026 at …". */
export function formatStamp(iso, now = new Date()) {
  return `${formatDay(iso, now)} at ${formatTime(iso)}`;
}
