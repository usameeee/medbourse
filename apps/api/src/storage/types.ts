export interface StoredObject {
  key: string;
  bytes: Buffer;
  mimeType: string;
}

export interface ObjectStorage {
  put(input: { key: string; bytes: Buffer; mimeType: string }): Promise<void>;
  get(key: string): Promise<StoredObject>;
  /** Best-effort removal; a missing object is not an error. */
  delete(key: string): Promise<void>;
}
