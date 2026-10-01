// Data access: every query is a prepared statement with bound parameters.

const SQLITE_CONSTRAINT_UNIQUE = 2067;

export function isUniqueViolation(err) {
  return err?.errcode === SQLITE_CONSTRAINT_UNIQUE;
}

const now = () => new Date().toISOString();

const toUser = (row) =>
  row && {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    createdAt: row.created_at,
  };

const toChannel = (row) =>
  row && {
    id: row.id,
    name: row.name,
    topic: row.topic,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };

const toMessage = (row) =>
  row && {
    id: row.id,
    channelId: row.channel_id,
    content: row.content,
    createdAt: row.created_at,
    editedAt: row.edited_at,
    author: {
      id: row.author_id,
      username: row.author_username,
      displayName: row.author_display_name,
    },
  };

export function createStore(db) {
  const sql = {
    countUsers: db.prepare('SELECT COUNT(*) AS count FROM users'),
    userById: db.prepare('SELECT id, username, display_name, created_at FROM users WHERE id = ?'),
    usernameExists: db.prepare('SELECT 1 FROM users WHERE username = ?'),
    credentials: db.prepare('SELECT id, password_hash FROM users WHERE username = ?'),
    insertUser: db.prepare(
      'INSERT INTO users (username, display_name, password_hash, created_at) VALUES (?, ?, ?, ?)',
    ),
    listUsers: db.prepare(
      'SELECT id, username, display_name, created_at FROM users ORDER BY display_name COLLATE NOCASE, id',
    ),

    countChannels: db.prepare('SELECT COUNT(*) AS count FROM channels'),
    listChannels: db.prepare(
      'SELECT id, name, topic, created_by, created_at FROM channels ORDER BY id',
    ),
    channelById: db.prepare(
      'SELECT id, name, topic, created_by, created_at FROM channels WHERE id = ?',
    ),
    channelNameExists: db.prepare('SELECT 1 FROM channels WHERE name = ?'),
    insertChannel: db.prepare(
      'INSERT INTO channels (name, topic, created_by, created_at) VALUES (?, ?, ?, ?)',
    ),
    deleteChannel: db.prepare('DELETE FROM channels WHERE id = ?'),

    messageById: db.prepare(
      `SELECT m.id, m.channel_id, m.content, m.created_at, m.edited_at, m.author_id,
              u.username AS author_username, u.display_name AS author_display_name
       FROM messages m JOIN users u ON u.id = m.author_id
       WHERE m.id = ?`,
    ),
    // Newest first so LIMIT keeps the latest page; callers reverse it.
    messagesBefore: db.prepare(
      `SELECT m.id, m.channel_id, m.content, m.created_at, m.edited_at, m.author_id,
              u.username AS author_username, u.display_name AS author_display_name
       FROM messages m JOIN users u ON u.id = m.author_id
       WHERE m.channel_id = ? AND m.id < ?
       ORDER BY m.id DESC
       LIMIT ?`,
    ),
    insertMessage: db.prepare(
      'INSERT INTO messages (channel_id, author_id, content, created_at) VALUES (?, ?, ?, ?)',
    ),
    updateMessage: db.prepare('UPDATE messages SET content = ?, edited_at = ? WHERE id = ?'),
    deleteMessage: db.prepare('DELETE FROM messages WHERE id = ?'),

    insertSession: db.prepare(
      'INSERT INTO sessions (jti, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
    ),
    sessionUser: db.prepare(
      `SELECT u.id, u.username, u.display_name, u.created_at
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.jti = ? AND s.user_id = ? AND s.expires_at > ?`,
    ),
    sessionActive: db.prepare('SELECT 1 FROM sessions WHERE jti = ? AND expires_at > ?'),
    deleteSession: db.prepare('DELETE FROM sessions WHERE jti = ?'),
    deleteExpiredSessions: db.prepare('DELETE FROM sessions WHERE expires_at <= ?'),

    userByUsername: db.prepare(
      'SELECT id, username, display_name, created_at FROM users WHERE username = ?',
    ),
    deleteUserSessions: db.prepare('DELETE FROM sessions WHERE user_id = ?'),
    deleteUserMessages: db.prepare('DELETE FROM messages WHERE author_id = ?'),
    orphanUserChannels: db.prepare('UPDATE channels SET created_by = NULL WHERE created_by = ?'),
    deleteUser: db.prepare('DELETE FROM users WHERE id = ?'),
  };

  const transaction = (fn) => {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      db.exec('COMMIT');
      return result;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  };

  const store = {
    countUsers: () => sql.countUsers.get().count,
    findUserById: (id) => toUser(sql.userById.get(id)),
    usernameExists: (username) => Boolean(sql.usernameExists.get(username)),
    findCredentials: (username) => {
      const row = sql.credentials.get(username);
      return row && { id: row.id, passwordHash: row.password_hash };
    },
    createUser({ username, displayName, passwordHash }) {
      const { lastInsertRowid } = sql.insertUser.run(username, displayName, passwordHash, now());
      return store.findUserById(lastInsertRowid);
    },
    listUsers: () => sql.listUsers.all().map(toUser),

    countChannels: () => sql.countChannels.get().count,
    listChannels: () => sql.listChannels.all().map(toChannel),
    findChannel: (id) => toChannel(sql.channelById.get(id)),
    channelNameExists: (name) => Boolean(sql.channelNameExists.get(name)),
    createChannel({ name, topic, createdBy }) {
      const { lastInsertRowid } = sql.insertChannel.run(name, topic, createdBy, now());
      return store.findChannel(lastInsertRowid);
    },
    deleteChannel: (id) => sql.deleteChannel.run(id).changes > 0,

    findMessage: (id) => toMessage(sql.messageById.get(id)),
    listMessages(channelId, { before = Number.MAX_SAFE_INTEGER, limit }) {
      return sql.messagesBefore.all(channelId, before, limit).map(toMessage).reverse();
    },
    createMessage({ channelId, authorId, content }) {
      const { lastInsertRowid } = sql.insertMessage.run(channelId, authorId, content, now());
      return store.findMessage(lastInsertRowid);
    },
    updateMessage(id, content) {
      sql.updateMessage.run(content, now(), id);
      return store.findMessage(id);
    },
    deleteMessage: (id) => sql.deleteMessage.run(id).changes > 0,

    createSession({ jti, userId, expiresAt }) {
      sql.insertSession.run(jti, userId, now(), expiresAt);
    },
    /** The user owning an unexpired session `jti`, if it belongs to `userId`. */
    findSessionUser: (jti, userId) => toUser(sql.sessionUser.get(jti, userId, now())),
    isSessionActive: (jti) => Boolean(sql.sessionActive.get(jti, now())),
    deleteSession: (jti) => sql.deleteSession.run(jti).changes > 0,
    deleteExpiredSessions: () => sql.deleteExpiredSessions.run(now()).changes,

    findUserByUsername: (username) => toUser(sql.userByUsername.get(username)),
    /**
     * Deletes a user with their messages and sessions. Channels they created stay, with no
     * owner (like #general). Returns what was removed, or null if the user doesn't exist.
     */
    removeUser: (id) =>
      transaction(() => {
        const user = store.findUserById(id);
        if (!user) return null;
        const sessions = sql.deleteUserSessions.run(id).changes;
        const messages = sql.deleteUserMessages.run(id).changes;
        const channels = sql.orphanUserChannels.run(id).changes;
        sql.deleteUser.run(id);
        return { user, messages, sessions, channels };
      }),
  };

  return store;
}
