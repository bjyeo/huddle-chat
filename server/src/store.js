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
  };

  return store;
}
