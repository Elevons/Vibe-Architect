/// <reference types="vite/client" />

/**
 * Host-provided key/value storage (e.g. Tauri's storage plugin).
 * The app degrades gracefully when it is unavailable.
 */
interface StorageItem {
  key: string;
  value: string;
}

interface StorageListResult {
  keys: string[];
}

interface WindowStorage {
  get(key: string): Promise<StorageItem | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<StorageListResult | null>;
}

interface Window {
  storage?: WindowStorage;
}
