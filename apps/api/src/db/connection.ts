import mongoose from 'mongoose';
import { config } from '../config.js';

export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

export async function connectDatabase(): Promise<void> {
  if (!config.mongodbUri) {
    console.warn('[medbourse-api] MONGODB_URI is empty; skipping database connection');
    return;
  }

  mongoose.set('strictQuery', true);
  await mongoose.connect(config.mongodbUri);
  console.info('[medbourse-api] MongoDB connected');
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState === 0) {
    return;
  }
  await mongoose.disconnect();
}
