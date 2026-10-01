import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export const COOKIE_NAME = 'token';
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const BCRYPT_COST = 10;

// Compared against when the username doesn't exist, so unknown users cost the same time.
const DUMMY_HASH = '$2b$10$Fx1DfrpwkVG2EcJ34bq6ku8QGZiqLTUzQryONZUGeI/xJffI3n8va';

export const hashPassword = (password) => bcrypt.hash(password, BCRYPT_COST);

export const verifyPassword = (password, hash) => bcrypt.compare(password, hash ?? DUMMY_HASH);

// jwtid makes every login a distinct session, even two within the same second.
export const signToken = (userId, secret) =>
  jwt.sign({ sub: userId }, secret, {
    algorithm: 'HS256',
    expiresIn: '7d',
    jwtid: crypto.randomUUID(),
  });

/** Returns the user a token belongs to, or null for invalid/expired tokens and deleted users. */
export function authenticateToken(token, { store, secret }) {
  if (typeof token !== 'string' || token === '') return null;
  try {
    const { sub } = jwt.verify(token, secret, { algorithms: ['HS256'] });
    return Number.isSafeInteger(sub) ? (store.findUserById(sub) ?? null) : null;
  } catch {
    return null;
  }
}

export function cookieOptions(config) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProduction,
    maxAge: SESSION_MS,
    path: '/',
  };
}

export function setSessionCookie(res, user, config) {
  res.cookie(COOKIE_NAME, signToken(user.id, config.jwtSecret), cookieOptions(config));
}

export function clearSessionCookie(res, config) {
  const { maxAge, ...options } = cookieOptions(config);
  res.clearCookie(COOKIE_NAME, options);
}

export function requireAuth({ store, config }) {
  return (req, res, next) => {
    const user = authenticateToken(req.cookies?.[COOKIE_NAME], {
      store,
      secret: config.jwtSecret,
    });
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    req.user = user;
    next();
  };
}

/** Constant-time string comparison (for invite codes). */
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const digest = (s) => crypto.createHash('sha256').update(s).digest();
  return crypto.timingSafeEqual(digest(a), digest(b));
}

/** In-memory fixed-window limiter counting failed logins per key (IP). */
export function createLoginLimiter({ maxFailures = 10, windowMs = 15 * 60 * 1000 } = {}) {
  const failures = new Map(); // key -> { count, resetAt }

  const current = (key) => {
    const entry = failures.get(key);
    if (entry && entry.resetAt <= Date.now()) {
      failures.delete(key);
      return undefined;
    }
    return entry;
  };

  return {
    /** Seconds until the key may try again, or 0 if it isn't blocked. */
    retryAfter(key) {
      const entry = current(key);
      if (!entry || entry.count < maxFailures) return 0;
      return Math.ceil((entry.resetAt - Date.now()) / 1000);
    },
    recordFailure(key) {
      const entry = current(key);
      if (entry) entry.count += 1;
      else failures.set(key, { count: 1, resetAt: Date.now() + windowMs });
      if (failures.size > 10_000) {
        for (const k of failures.keys()) current(k);
      }
    },
  };
}
