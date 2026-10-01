import { Avatar } from './Avatar.jsx';
import { LogoutIcon } from './icons.jsx';

const STATUS = {
  connected: { dot: 'online', label: 'Connected' },
  connecting: { dot: 'idle', label: 'Connecting…' },
  disconnected: { dot: 'offline', label: 'Disconnected' },
};

export function UserPanel({ user, status, onLogout }) {
  const { dot, label } = STATUS[status];
  return (
    <div className="user-panel">
      <Avatar user={user} size={32} status={dot} />
      <div className="user-panel__info">
        <span className="user-panel__name">{user.displayName}</span>
        <span className="user-panel__status" role="status">
          {label}
        </span>
      </div>
      <button
        type="button"
        className="icon-btn"
        aria-label="Log out"
        title="Log out"
        onClick={onLogout}
      >
        <LogoutIcon size={18} />
      </button>
    </div>
  );
}
