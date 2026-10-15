import { connectDatabase, disconnectDatabase, isDatabaseConnected } from '../db/connection.js';

try {
  await connectDatabase();
  console.info(isDatabaseConnected() ? 'db:connected' : 'db:disconnected');
} catch (err) {
  const name = err instanceof Error ? err.name : 'Error';
  console.error(`db:failed (${name})`);
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
