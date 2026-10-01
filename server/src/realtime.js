import { parseCookie } from 'cookie';
import { Server } from 'socket.io';
import { COOKIE_NAME, authenticateToken } from './auth.js';

const MEMBERS_ROOM = 'members';
const TYPING_THROTTLE_MS = 1000;

const userRoom = (userId) => `user:${userId}`;

export function createRealtime(httpServer, { store, config }) {
  const io = new Server(httpServer, {
    cors: { origin: config.clientOrigin, credentials: true },
    // Browsers always send Origin on websocket handshakes; refuse other sites (CSWSH).
    allowRequest(req, callback) {
      const { origin, host } = req.headers;
      if (!origin || origin === config.clientOrigin) return callback(null, true);
      let sameOrigin = false;
      try {
        sameOrigin = new URL(origin).host === host;
      } catch {
        // Malformed Origin header.
      }
      callback(null, sameOrigin);
    },
  });

  const connections = new Map(); // userId -> number of open sockets

  io.use((socket, next) => {
    const cookies = parseCookie(socket.handshake.headers.cookie ?? '');
    const token = cookies[COOKIE_NAME] ?? socket.handshake.auth?.token;
    const user = authenticateToken(token, { store, secret: config.jwtSecret });
    if (!user) return next(new Error('Not authenticated'));
    socket.data.user = user;
    next();
  });

  io.on('connection', (socket) => {
    const { user } = socket.data;
    socket.join([MEMBERS_ROOM, userRoom(user.id)]);

    const count = (connections.get(user.id) ?? 0) + 1;
    connections.set(user.id, count);
    if (count === 1) io.to(MEMBERS_ROOM).emit('presence:update', { userId: user.id, online: true });

    const lastTyping = new Map(); // channelId -> timestamp
    socket.on('typing', (payload) => {
      const channelId = payload?.channelId;
      if (!Number.isSafeInteger(channelId) || !store.findChannel(channelId)) return;
      const now = Date.now();
      if (now - (lastTyping.get(channelId) ?? 0) < TYPING_THROTTLE_MS) return;
      lastTyping.set(channelId, now);
      // Skip all of the sender's own sockets (other tabs), not just this one.
      socket
        .to(MEMBERS_ROOM)
        .except(userRoom(user.id))
        .emit('typing', { channelId, user: { id: user.id, displayName: user.displayName } });
    });

    socket.on('disconnect', () => {
      const remaining = (connections.get(user.id) ?? 1) - 1;
      if (remaining > 0) return connections.set(user.id, remaining);
      connections.delete(user.id);
      io.to(MEMBERS_ROOM).emit('presence:update', { userId: user.id, online: false });
    });
  });

  return {
    io,
    isOnline: (userId) => connections.has(userId),
    broadcast: (event, payload) => io.to(MEMBERS_ROOM).emit(event, payload),
  };
}
