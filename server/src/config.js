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

export function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';

  let jwtSecret = env.JWT_SECRET;
  if (!jwtSecret) {
    if (isProduction) throw new Error('JWT_SECRET is required when NODE_ENV=production');
    jwtSecret = crypto.randomBytes(48).toString('hex');
    console.warn('[config] JWT_SECRET not set: using a random secret, sessions reset on restart');
  }

  const databasePath = env.DATABASE_PATH || './data/huddle.db';

  return {
    nodeEnv,
    isProduction,
    port: parseInteger(env, 'PORT', 3001, 0),
    jwtSecret,
    databasePath:
      databasePath === ':memory:' ? databasePath : path.resolve(SERVER_DIR, databasePath),
    maxUsers: parseInteger(env, 'MAX_USERS', 10, 1),
    inviteCode: env.INVITE_CODE || null,
    clientOrigin: env.CLIENT_ORIGIN || 'http://localhost:5173',
    // Number of reverse proxies in front of the app; 0 ignores X-Forwarded-For entirely.
    trustProxy: parseInteger(env, 'TRUST_PROXY', 0, 0),
  };
}
