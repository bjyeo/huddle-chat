import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export const COOKIE_NAME = 'token';
const SESSION_SECONDS = 7 * 24 * 60 * 60;
const BCRYPT_COST = 10;

// Compared against when the username doesn't exist, so unknown users cost the same time.
const DUMMY_HASH = '$2b$10$Fx1DfrpwkVG2EcJ34bq6ku8QGZiqLTUzQryONZUGeI/xJffI3n8va';

export const hashPassword = (password) => bcrypt.hash(password, BCRYPT_COST);

export const verifyPassword = (password, hash) => bcrypt.compare(password, hash ?? DUMMY_HASH);

/**
 * Starts a server-side session for the user and returns its signed token. The token's `jti` is
 * the session row's key, so deleting the row (logout, user removal) revokes the token.
 */
export function issueToken(userId, { store, secret, ttlSeconds = SESSION_SECONDS }) {
  store.deleteExpiredSessions();
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + ttlSeconds;
  // A random jti makes every login a distinct session, even two within the same second.
  const jti = crypto.randomUUID();
  store.createSession({ jti, userId, expiresAt: new Date(exp * 1000).toISOString() });
  return jwt.sign({ sub: userId, iat, exp, jti }, secret, { algorithm: 'HS256' });
}

/**
 * Verifies a token against its session row. Returns `{ user, jti, expiresAt }` (ms), or null for
 * invalid, expired or revoked tokens and deleted users.
 */
export function verifySession(token, { store, secret }) {
  if (typeof token !== 'string' || token === '') return null;
  let payload;
  try {
    payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
  } catch {
    return null;
  }
  // jwt.verify only checks exp when present; every token we issue has exp and jti.
  const { sub, exp, jti } = payload;
  if (!Number.isSafeInteger(sub) || !Number.isFinite(exp) || typeof jti !== 'string' || !jti) {
    return null;
  }
  const user = store.findSessionUser(jti, sub);
  return user ? { user, jti, expiresAt: exp * 1000 } : null;
}

/** Returns the user a token belongs to, or null (see verifySession). */
export const authenticateToken = (token, deps) => verifySession(token, deps)?.user ?? null;

export function cookieOptions(config) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProduction,
    maxAge: SESSION_SECONDS * 1000,
    path: '/',
  };
}

export function setSessionCookie(res, user, { store, config }) {
  const token = issueToken(user.id, { store, secret: config.jwtSecret });
  res.cookie(COOKIE_NAME, token, cookieOptions(config));
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

/** Every registration attempt counts, so one IP can't script through the member slots. */
export const REGISTER_RATE_LIMIT = { limit: 5, windowMs: 60 * 60 * 1000 };

/**
 * In-memory fixed-window limiter: at most `limit` recorded hits per key (IP) per window.
 * Callers decide what counts as a hit (failed logins, wrong invite codes, every registration).
 */
export function createRateLimiter({ limit = 10, windowMs = 15 * 60 * 1000 } = {}) {
  const hits = new Map(); // key -> { count, resetAt }

  const current = (key) => {
    const entry = hits.get(key);
    if (entry && entry.resetAt <= Date.now()) {
      hits.delete(key);
      return undefined;
    }
    return entry;
  };

  return {
    /** Seconds until the key may try again, or 0 if it isn't blocked. */
    retryAfter(key) {
      const entry = current(key);
      if (!entry || entry.count < limit) return 0;
      return Math.ceil((entry.resetAt - Date.now()) / 1000);
    },
    record(key) {
      const entry = current(key);
      if (entry) entry.count += 1;
      else hits.set(key, { count: 1, resetAt: Date.now() + windowMs });
      if (hits.size > 10_000) {
        for (const k of hits.keys()) current(k);
      }
    },
    /** Undoes one recorded hit, for attempts counted up front that then succeed. */
    forgive(key) {
      const entry = current(key);
      if (entry && entry.count > 0) entry.count -= 1;
    },
  };
}
