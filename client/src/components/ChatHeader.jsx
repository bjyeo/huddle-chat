import { MenuIcon, UsersIcon } from './icons.jsx';

export function ChatHeader({ channel, membersOpen, onToggleSidebar, onToggleMembers }) {
  return (
    <header className="chat-header">
      <button
        type="button"
        className="icon-btn chat-header__menu"
        aria-label="Open channel list"
        onClick={onToggleSidebar}
      >
        <MenuIcon />
      </button>
      <h1 className="chat-header__title">
        <span className="chat-header__hash" aria-hidden="true">
          #
        </span>
        {channel?.name}
      </h1>
      {channel?.topic && (
        <p className="chat-header__topic" title={channel.topic}>
          {channel.topic}
        </p>
      )}
      <button
        type="button"
        className={`icon-btn chat-header__members${membersOpen ? ' is-active' : ''}`}
        aria-label={membersOpen ? 'Hide member list' : 'Show member list'}
        aria-pressed={membersOpen}
        onClick={onToggleMembers}
      >
        <UsersIcon />
      </button>
    </header>
  );
}
