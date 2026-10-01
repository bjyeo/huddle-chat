// Removes a member so their slot can be reused:
//   npm run remove-user -w server -- <username>
// Uses DATABASE_PATH from server/.env or the environment, like the server. Safe to run while
// the server is up: the user's sessions are revoked immediately.
import fs from 'node:fs';
import { describeRemoval, removeUser } from '../src/admin.js';
import { loadEnvFile, resolveDatabasePath } from '../src/config.js';
import { openDatabase } from '../src/db.js';

const args = process.argv.slice(2);
if (args.length !== 1 || args[0].startsWith('-')) {
  console.error('Usage: npm run remove-user -w server -- <username>');
  process.exit(2);
}
const [username] = args;

loadEnvFile();
const file = resolveDatabasePath(process.env);
// Don't let a typo in DATABASE_PATH silently create an empty database.
if (file === ':memory:' || !fs.existsSync(file)) {
  console.error(`No database found at ${file} (check DATABASE_PATH)`);
  process.exit(1);
}

const db = openDatabase(file);
try {
  const result = removeUser(db, username);
  if (result) {
    console.log(describeRemoval(result));
  } else {
    console.error(`No user named "${username}" in ${file}`);
    process.exitCode = 1;
  }
} finally {
  db.close();
}
