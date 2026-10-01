import { MAX_MEMBERS } from '../lib/validation.js';
import { Avatar } from './Avatar.jsx';

function MemberGroup({ title, members, currentUserId }) {
  if (members.length === 0) return null;
  return (
    <section className="members__group">
      <h3 className="members__heading">
        {title} — {members.length}
      </h3>
      <ul>
        {members.map((member) => (
          <li key={member.id} className={`member${member.online ? '' : ' member--offline'}`}>
            <Avatar user={member} size={32} status={member.online ? 'online' : 'offline'} />
            <span className="member__name">
              {member.displayName}
              {member.id === currentUserId && <span className="member__you"> (you)</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function MemberList({ online, offline, currentUserId }) {
  return (
    <aside className="members" aria-label="Members">
      <MemberGroup title="Online" members={online} currentUserId={currentUserId} />
      <MemberGroup title="Offline" members={offline} currentUserId={currentUserId} />
      <p className="members__note">
        {online.length + offline.length} / {MAX_MEMBERS} members
      </p>
    </aside>
  );
}
