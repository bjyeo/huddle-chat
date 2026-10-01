import { avatarColor, initials } from '../lib/avatar.js';

/** Initials avatar with a deterministic color; `status` adds a presence dot. */
export function Avatar({ user, size = 40, status }) {
  return (
    <span
      className="avatar"
      style={{ '--avatar-size': `${size}px`, '--avatar-color': avatarColor(user.username) }}
      aria-hidden="true"
    >
      {initials(user.displayName)}
      {status && <span className={`status-dot status-dot--${status}`} />}
    </span>
  );
}
