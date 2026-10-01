import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { createLoginLimiter, requireAuth } from './auth.js';
import { createRealtime } from './realtime.js';
import { authRouter } from './routes/auth.js';
import { channelsRouter } from './routes/channels.js';
import { channelMessagesRouter, messagesRouter } from './routes/messages.js';
import { usersRouter } from './routes/users.js';
import { createStore } from './store.js';

const CLIENT_DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');

/**
 * Builds the Express app, HTTP server and Socket.IO server around an open database.
 * The caller owns `db` and is responsible for closing it.
 */
export function createApp({ db, config, clientDist = CLIENT_DIST }) {
  const store = createStore(db);
  const app = express();
  const httpServer = http.createServer(app);
  const realtime = createRealtime(httpServer, { store, config });
  const deps = {
    store,
    config,
    broadcast: realtime.broadcast,
    isOnline: realtime.isOnline,
    endSession: realtime.endSession,
    loginLimiter: createLoginLimiter(),
    inviteLimiter: createLoginLimiter(),
  };

  // Makes req.ip (used by the rate limiters) the real client IP behind N trusted proxies.
  if (config.trustProxy) app.set('trust proxy', config.trustProxy);

  // Helmet's default CSP (script-src 'self', connect-src via default-src 'self') suits the Vite build.
  app.use(helmet());
  app.use(cors({ origin: config.clientOrigin, credentials: true }));
  app.use(express.json({ limit: '16kb' }));
  app.use(cookieParser());

  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRouter(deps));

  const authed = requireAuth(deps);
  app.use('/api/users', authed, usersRouter(deps));
  app.use('/api/channels/:id/messages', authed, channelMessagesRouter(deps));
  app.use('/api/channels', authed, channelsRouter(deps));
  app.use('/api/messages', authed, messagesRouter(deps));
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

  if (config.isProduction && fs.existsSync(clientDist)) {
    app.use(express.static(clientDist, { index: false }));
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      // `root` keeps send's dotfile check off the install path (e.g. ~/.apps/huddle).
      res.sendFile('index.html', { root: clientDist });
    });
  }

  app.use((req, res) => res.status(404).json({ error: 'Not found' }));

  // Express recognises error handlers by their 4-argument signature.
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Malformed JSON body' });
    }
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Request body too large' });
    }
    const status = Number.isInteger(err.status) && err.status >= 400 ? err.status : 500;
    if (status >= 500) {
      console.error(err);
      return res.status(500).json({ error: 'Internal server error' });
    }
    res.status(status).json({ error: err.expose ? err.message : 'Bad request' });
  });

  const close = () =>
    new Promise((resolve) => {
      realtime.io.close(() => resolve());
    });

  return { app, httpServer, io: realtime.io, close };
}
