import { config } from '../config.js';
import { localStorage } from './local.js';
import { memoryStorage } from './memory.js';
import type { ObjectStorage } from './types.js';

export function getObjectStorage(): ObjectStorage {
  if (config.storageDriver === 'memory') {
    return memoryStorage;
  }
  return localStorage;
}
