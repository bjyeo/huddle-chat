import { createApp } from './app.js';
import { loadConfig, loadEnvFile } from './config.js';
import { openDatabase } from './db.js';

loadEnvFile();
const config = loadConfig();
const db = openDatabase(config.databasePath);
const { httpServer, close } = createApp({ db, config });

httpServer.listen(config.port, () => {
  const { port } = httpServer.address();
  console.log(`Huddle server listening on http://localhost:${port} (${config.nodeEnv})`);
});

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down`);
  setTimeout(() => process.exit(1), 5000).unref();
  await close();
  db.close();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
