import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Loads `server/.env` into process.env if it exists (existing variables win). */
export function loadEnvFile(file = path.join(SERVER_DIR, '.env')) {
  try {
    process.loadEnvFile(file);
  } catch {
    // No .env file — rely on the real environment.
  }
}

function parseInteger(env, name, fallback, min) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min) {
    throw new Error(`${name} must be an integer >= ${min} (got "${raw}")`);
  }
  return value;
}

function parseBoolean(env, name) {
  const raw = (env[name] ?? '').trim().toLowerCase();
  if (raw === '' || raw === 'false') return false;
  if (raw === 'true') return true;
  throw new Error(`${name} must be "true" or "false" (got "${env[name]}")`);
}

export const MIN_SECRET_LENGTH = 32;
const GENERATE_SECRET = `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`;

// Values people copy from docs and examples. Compared with case and separators (-, _, ., spaces)
// ignored, so "Change_Me", "JWT-SECRET" and "your.secret.here" are all caught.
const PLACEHOLDER_VALUES = ['secret', 'password', 'jwtsecret', 'supersecret', 'testsecret'];
const PLACEHOLDER_PHRASES = ['changeme', 'yoursecret', 'replaceme', 'placeholder'];

/** Why `secret` is unfit to sign production sessions, or null when it's acceptable. */
export function weakSecretReason(secret) {
  const squashed = secret.toLowerCase().replace(/[\s._-]+/g, '');
  if (
    PLACEHOLDER_VALUES.includes(squashed) ||
    PLACEHOLDER_PHRASES.some((phrase) => squashed.includes(phrase))
  ) {
    return 'is a placeholder value';
  }
  if (secret.length < MIN_SECRET_LENGTH) return `is shorter than ${MIN_SECRET_LENGTH} characters`;
  if (new Set(secret).size < 8) return 'has too few distinct characters';
  return null;
}

/** Resolves DATABASE_PATH relative to `server/`; `:memory:` is kept as is. */
export function resolveDatabasePath(env = process.env) {
  const databasePath = env.DATABASE_PATH || './data/huddle.db';
  return databasePath === ':memory:' ? databasePath : path.resolve(SERVER_DIR, databasePath);
}

export function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';

  let jwtSecret = env.JWT_SECRET;
  if (!jwtSecret) {
    if (isProduction) {
      throw new Error(
        `JWT_SECRET is required when NODE_ENV=production. Generate one with: ${GENERATE_SECRET}`,
      );
    }
    jwtSecret = crypto.randomBytes(48).toString('hex');
    console.warn('[config] JWT_SECRET not set: using a random secret, sessions reset on restart');
  } else if (isProduction) {
    // Anyone who knows or guesses the secret can forge a session for any user.
    const reason = weakSecretReason(jwtSecret);
    if (reason) {
      throw new Error(
        `JWT_SECRET ${reason}: use a unique random value of at least ${MIN_SECRET_LENGTH} characters. Generate one with: ${GENERATE_SECRET}`,
      );
    }
  }

  const inviteCode = env.INVITE_CODE || null;
  const allowOpenRegistration = parseBoolean(env, 'ALLOW_OPEN_REGISTRATION');
  if (isProduction && !inviteCode && !allowOpenRegistration) {
    throw new Error(
      'INVITE_CODE is required when NODE_ENV=production (without it anyone who finds the server can register and fill every member slot). Set ALLOW_OPEN_REGISTRATION=true to run without one on purpose.',
    );
  }

  return {
    nodeEnv,
    isProduction,
    port: parseInteger(env, 'PORT', 3001, 0),
    jwtSecret,
    databasePath: resolveDatabasePath(env),
    maxUsers: parseInteger(env, 'MAX_USERS', 10, 1),
    inviteCode,
    allowOpenRegistration,
    clientOrigin: env.CLIENT_ORIGIN || 'http://localhost:5173',
    // Number of reverse proxies in front of the app; 0 ignores X-Forwarded-For entirely.
    trustProxy: parseInteger(env, 'TRUST_PROXY', 0, 0),
  };
}
