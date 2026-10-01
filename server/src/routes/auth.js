import { Router } from 'express';
import {
  COOKIE_NAME,
  clearSessionCookie,
  hashPassword,
  requireAuth,
  safeEqual,
  setSessionCookie,
  verifyPassword,
  verifySession,
} from '../auth.js';
import { isUniqueViolation } from '../store.js';
import { validateDisplayName, validatePassword, validateUsername } from '../validation.js';

export function authRouter(deps) {
  const { store, config, loginLimiter, inviteLimiter, registerLimiter, broadcast, endSession } =
    deps;
  const router = Router();
  const fullError = `This server is full (max ${config.maxUsers} members)`;

  const tooMany = (res, retryAfter, error) => {
    res.set('Retry-After', String(retryAfter));
    res.status(429).json({ error });
  };

  router.post('/register', async (req, res) => {
    // With open registration, every attempt counts so one IP can't script through the member
    // slots. With an invite code the code is the gate (wrong guesses are limited below), so a
    // group signing up from one office or dorm IP isn't blocked halfway through.
    if (!config.inviteCode) {
      const registerRetryAfter = registerLimiter.retryAfter(req.ip);
      if (registerRetryAfter > 0) {
        return tooMany(res, registerRetryAfter, 'Too many registration attempts, try again later');
      }
      registerLimiter.record(req.ip);
    }

    // Invite codes are the only gate on joining, so guessing them is rate limited like logins.
    const inviteRetryAfter = config.inviteCode ? inviteLimiter.retryAfter(req.ip) : 0;
    if (inviteRetryAfter > 0) {
      return tooMany(res, inviteRetryAfter, 'Too many invalid invite codes, try again later');
    }

    const { username, password, displayName, inviteCode } = req.body ?? {};

    const name = validateUsername(username);
    if (name.error) return res.status(400).json({ error: name.error });
    const pass = validatePassword(password);
    if (pass.error) return res.status(400).json({ error: pass.error });
    const display = validateDisplayName(displayName, username);
    if (display.error) return res.status(400).json({ error: display.error });

    if (config.inviteCode && !safeEqual(inviteCode, config.inviteCode)) {
      inviteLimiter.record(req.ip);
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

    setSessionCookie(res, user, { store, config });
    broadcast('user:joined', { user });
    res.status(201).json({ user });
  });

  router.post('/login', async (req, res) => {
    const retryAfter = loginLimiter.retryAfter(req.ip);
    if (retryAfter > 0) {
      return tooMany(res, retryAfter, 'Too many failed login attempts, try again later');
    }

    const { username, password } = req.body ?? {};
    if (typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Count the attempt before the slow bcrypt compare so a parallel burst can't slip past the
    // limit; a successful login takes it back.
    loginLimiter.record(req.ip);
    const credentials = store.findCredentials(username);
    const valid = await verifyPassword(password, credentials?.passwordHash);
    if (!credentials || !valid) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    loginLimiter.forgive(req.ip);

    const user = store.findUserById(credentials.id);
    setSessionCookie(res, user, { store, config });
    res.json({ user });
  });

  router.post('/logout', async (req, res) => {
    const token = req.cookies?.[COOKIE_NAME];
    const session = verifySession(token, { store, secret: config.jwtSecret });
    if (session) {
      // Revoke the token server-side so a copy of the cookie stops working too, then close the
      // sockets it opened (they were authenticated once, at handshake).
      store.deleteSession(session.jti);
      await endSession(session.user.id, token);
    }
    clearSessionCookie(res, config);
    res.status(204).end();
  });

  router.get('/me', requireAuth({ store, config }), (req, res) => {
    res.json({ user: req.user });
  });

  return router;
}
