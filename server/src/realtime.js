import { TYPING_THROTTLE_MS } from '@huddle/shared';
import { parseCookie } from 'cookie';
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { COOKIE_NAME, authenticateToken } from './auth.js';

const MEMBERS_ROOM = 'members';
const MAX_TIMEOUT_MS = 2 ** 31 - 1; // setTimeout's ceiling (~24.8 days)

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
    // Try the cookie first, then handshake auth, so a stale cookie can't mask a valid token.
    const authenticated = [cookies[COOKIE_NAME], socket.handshake.auth?.token]
      .map((candidate) => ({
        token: candidate,
        user: authenticateToken(candidate, { store, secret: config.jwtSecret }),
      }))
      .find(({ user }) => user);
    if (!authenticated) return next(new Error('Not authenticated'));
    const { token, user } = authenticated;
    socket.data.user = user;
    socket.data.token = token;
    socket.data.expiresAt = jwt.decode(token).exp * 1000;
    next();
  });

  io.on('connection', (socket) => {
    const { user } = socket.data;
    socket.join([MEMBERS_ROOM, userRoom(user.id)]);

    // The handshake is the only auth check, so drop the socket when its session expires.
    const expiry = setTimeout(
      () => socket.disconnect(true),
      Math.min(Math.max(socket.data.expiresAt - Date.now(), 0), MAX_TIMEOUT_MS),
    );

    const count = (connections.get(user.id) ?? 0) + 1;
    connections.set(user.id, count);
    if (count === 1) io.to(MEMBERS_ROOM).emit('presence:update', { userId: user.id, online: true });

    // Relay at most one typing event per channel per TYPING_THROTTLE_MS; drop the rest silently.
    const lastTyping = new Map(); // channelId -> timestamp of the last relayed event
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
      clearTimeout(expiry);
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
    /** Disconnects the sockets opened with this session token (other devices stay connected). */
    async endSession(userId, token) {
      for (const socket of await io.in(userRoom(userId)).fetchSockets()) {
        if (socket.data.token === token) socket.disconnect(true);
      }
    },
  };
}
