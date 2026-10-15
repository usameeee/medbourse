import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppError } from '../errors/AppError.js';
import type { ObjectStorage, StoredObject } from './types.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.data/private-docs');

function resolveKey(key: string): string {
  const safe = key.replace(/[^a-zA-Z0-9._-]/g, '_');
  return path.join(root, safe);
}

export const localStorage: ObjectStorage = {
  async put(input) {
    await mkdir(root, { recursive: true });
    await writeFile(resolveKey(input.key), input.bytes);
  },
  async get(key) {
    try {
      const bytes = await readFile(resolveKey(key));
      return { key, bytes, mimeType: 'application/octet-stream' };
    } catch {
      throw new AppError(404, 'NOT_FOUND', 'Stored object not found');
    }
  },
};
