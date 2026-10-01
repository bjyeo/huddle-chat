import { Router } from 'express';
import {
  clearSessionCookie,
  hashPassword,
  requireAuth,
  safeEqual,
  setSessionCookie,
  verifyPassword,
} from '../auth.js';
import { isUniqueViolation } from '../store.js';
import { validateDisplayName, validatePassword, validateUsername } from '../validation.js';

export function authRouter({ store, config, loginLimiter, broadcast }) {
  const router = Router();
  const fullError = `This server is full (max ${config.maxUsers} members)`;

  router.post('/register', async (req, res) => {
    const { username, password, displayName, inviteCode } = req.body ?? {};

    const name = validateUsername(username);
    if (name.error) return res.status(400).json({ error: name.error });
    const pass = validatePassword(password);
    if (pass.error) return res.status(400).json({ error: pass.error });
    const display = validateDisplayName(displayName, username);
    if (display.error) return res.status(400).json({ error: display.error });

    if (config.inviteCode && !safeEqual(inviteCode, config.inviteCode)) {
      return res.status(403).json({ error: 'Invalid invite code' });
    }
    if (store.countUsers() >= config.maxUsers) return res.status(403).json({ error: fullError });
    if (store.usernameExists(username)) {
      return res.status(409).json({ error: 'Username is already taken' });
    }

    const passwordHash = await hashPassword(password);

    // Re-check after the async hash: another registration may have landed meanwhile.
    if (store.countUsers() >= config.maxUsers) return res.status(403).json({ error: fullError });
    let user;
    try {
      user = store.createUser({ username, displayName: display.value, passwordHash });
    } catch (err) {
      if (isUniqueViolation(err)) {
        return res.status(409).json({ error: 'Username is already taken' });
      }
      throw err;
    }

    setSessionCookie(res, user, config);
    broadcast('user:joined', { user });
    res.status(201).json({ user });
  });

  router.post('/login', async (req, res) => {
    const retryAfter = loginLimiter.retryAfter(req.ip);
    if (retryAfter > 0) {
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ error: 'Too many failed login attempts, try again later' });
    }

    const { username, password } = req.body ?? {};
    if (typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const credentials = store.findCredentials(username);
    const valid = await verifyPassword(password, credentials?.passwordHash);
    if (!credentials || !valid) {
      loginLimiter.recordFailure(req.ip);
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const user = store.findUserById(credentials.id);
    setSessionCookie(res, user, config);
    res.json({ user });
  });

  router.post('/logout', (req, res) => {
    clearSessionCookie(res, config);
    res.status(204).end();
  });

  router.get('/me', requireAuth({ store, config }), (req, res) => {
    res.json({ user: req.user });
  });

  return router;
}
