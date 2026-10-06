'use strict';
const { createApp } = require('./app');
const { createPool, createPgRepo } = require('./repo-pg');
const { createMemoryRepo } = require('./repo-memory');

const PORT = Number(process.env.PORT || 3000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function chooseRepo() {
  if (process.env.DB_HOST) return createPgRepo(createPool(process.env));
  if (process.env.NODE_ENV === 'production') {
    console.error('DB_HOST is required in production. Refusing to start without a database.');
    process.exit(1);
  }
  console.warn('DB_HOST not set: using in-memory storage (development only, data is lost on restart).');
  return createMemoryRepo();
}

// The database may still be starting (Docker, RDS), so retry before giving up
async function initWithRetry(repo, attempts = 30, delayMs = 2000) {
  for (let i = 1; i <= attempts; i++) {
    try {
      await repo.init();
      console.log('Database ready.');
      return;
    } catch (err) {
      console.error(`Database init failed (attempt ${i}/${attempts}): ${err.message}`);
      if (i === attempts) throw err;
      await sleep(delayMs);
    }
  }
}

async function main() {
  const repo = chooseRepo();
  // Listen first: /health returns 503 until the database is reachable, so deploy.sh can decide to roll back
  const server = createApp(repo).listen(PORT, () => console.log(`CampusTask listening on port ${PORT}`));
  try {
    await initWithRetry(repo);
  } catch (err) {
    console.error('Could not initialise the database. Exiting.');
    process.exit(1);
  }
  const shutdown = () => server.close(() => repo.close().finally(() => process.exit(0)));
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main();
