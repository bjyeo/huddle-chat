import { useMessageAnnouncements } from '../hooks/useMessageAnnouncements.js';

/**
 * Visually hidden polite live region for newly arrived messages. Each announcement is a new
 * element, so repeated identical text ("Bob: ok") is still read out. No role="status": its
 * implicit aria-atomic would re-read the older announcements kept alongside.
 */
export function MessageAnnouncer({ channelId, currentUserId }) {
  const announcements = useMessageAnnouncements(channelId, currentUserId);
  return (
    <div
      className="visually-hidden"
      aria-live="polite"
      aria-atomic="false"
      aria-relevant="additions"
    >
      {announcements.map(({ key, text }) => (
        <p key={key}>{text}</p>
      ))}
    </div>
  );
}
