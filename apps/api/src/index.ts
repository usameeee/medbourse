import { createApp } from './app.js';
import { config } from './config.js';
import { connectDatabase } from './db/connection.js';

const app = createApp();

async function start() {
  try {
    await connectDatabase();
  } catch (err) {
    const name = err instanceof Error ? err.name : 'Error';
    console.error(`[medbourse-api] MongoDB connection failed (${name})`);
    if (config.nodeEnv === 'production') {
      process.exit(1);
    }
  }

  app.listen(config.port, config.host, () => {
    console.info(
      `[medbourse-api] listening on http://${config.host}:${config.port}/api/v1/health`,
    );
  });
}

void start();
