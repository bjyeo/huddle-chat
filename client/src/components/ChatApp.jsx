import { useAuth } from '../hooks/useAuth.jsx';
import { useChannels } from '../hooks/useChannels.js';
import { useMembers } from '../hooks/useMembers.js';
import { usePanels } from '../hooks/usePanels.js';
import { useSocket } from '../hooks/useSocket.jsx';
import { useUnread } from '../hooks/useUnread.js';
import { ChannelList } from './ChannelList.jsx';
import { ChatHeader } from './ChatHeader.jsx';
import { ChatView } from './ChatView.jsx';
import { MemberList } from './MemberList.jsx';
import { UserPanel } from './UserPanel.jsx';
import { LogoIcon } from './icons.jsx';

/** Logged-in shell: channel sidebar, chat column and member list. */
export function ChatApp() {
  const { user, logout } = useAuth();
  const { status } = useSocket();
  const { channels, loading, error, activeChannel, selectChannel, createChannel, deleteChannel } =
    useChannels();
  const unread = useUnread(activeChannel?.id);
  const { online, offline } = useMembers();
  const panels = usePanels();

  const openChannel = (id) => {
    selectChannel(id);
    panels.closeSidebar();
  };

  const create = async (fields) => {
    const channel = await createChannel(fields);
    openChannel(channel.id);
  };

  const className = [
    'app',
    panels.sidebarOpen && 'app--sidebar-open',
    panels.membersOpen && 'app--members-open',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={className}>
      <aside className="sidebar" aria-label="Sidebar">
        <div className="sidebar__brand">
          <LogoIcon size={22} />
          <span>Huddle</span>
        </div>
        <ChannelList
          channels={channels}
          activeId={activeChannel?.id}
          unread={unread}
          currentUserId={user.id}
          onSelect={openChannel}
          onCreate={create}
          onDelete={deleteChannel}
        />
        <UserPanel user={user} status={status} onLogout={logout} />
      </aside>
      <div
        className="backdrop backdrop--sidebar"
        onClick={panels.closeSidebar}
        aria-hidden="true"
      />

      <main className="chat">
        <ChatHeader
          channel={activeChannel}
          membersOpen={panels.membersOpen}
          onToggleSidebar={panels.toggleSidebar}
          onToggleMembers={panels.toggleMembers}
        />
        {activeChannel ? (
          <ChatView channel={activeChannel} currentUserId={user.id} />
        ) : (
          <p className={`chat__placeholder${error ? ' form-error' : ''}`} role="status">
            {error ?? (loading ? 'Loading channels…' : 'No channels yet.')}
          </p>
        )}
      </main>

      {panels.membersOpen && (
        <>
          <MemberList online={online} offline={offline} currentUserId={user.id} />
          <div
            className="backdrop backdrop--members"
            onClick={panels.closeMembers}
            aria-hidden="true"
          />
        </>
      )}
    </div>
  );
}
