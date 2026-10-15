import { AppError } from '../errors/AppError.js';
import type { ObjectStorage, StoredObject } from './types.js';

const objects = new Map<string, StoredObject>();

export const memoryStorage: ObjectStorage = {
  async put(input) {
    objects.set(input.key, { key: input.key, bytes: input.bytes, mimeType: input.mimeType });
  },
  async get(key) {
    const found = objects.get(key);
    if (!found) {
      throw new AppError(404, 'NOT_FOUND', 'Stored object not found');
    }
    return found;
  },
};

export function resetMemoryStorage() {
  objects.clear();
}
