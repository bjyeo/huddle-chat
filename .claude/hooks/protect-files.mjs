// PreToolUse (Edit|Write|MultiEdit): refuse to touch secrets, lockfiles, databases and git internals.
// Exit code 2 blocks the tool call and shows stderr to Claude.
import path from 'node:path';
import { readHookInput } from './read-input.mjs';

const input = await readHookInput();
const filePath = input.tool_input?.file_path ?? input.tool_input?.notebook_path ?? '';
if (!filePath) process.exit(0);

const normalized = filePath.split('\\').join('/');
const base = path.posix.basename(normalized);

const rules = [
  [
    /^\.env(\..+)?$/.test(base) && base !== '.env.example',
    'Secrets file (.env) — edit .env.example instead.',
  ],
  [
    base === 'package-lock.json',
    'Lockfile — change dependencies with npm install instead of editing it.',
  ],
  [
    /\.(db|db-wal|db-shm|db-journal)$/.test(base),
    'SQLite database file — use migrations in server/src/db.js.',
  ],
  [/(^|\/)\.git\//.test(normalized), 'Git internals.'],
];

for (const [blocked, reason] of rules) {
  if (blocked) {
    console.error(`Blocked by .claude/hooks/protect-files.mjs: ${normalized}\n${reason}`);
    process.exit(2);
  }
}
