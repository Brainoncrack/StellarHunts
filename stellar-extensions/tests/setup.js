/**
 * Minimal `Storage` implementation for the Node test environment.
 *
 * The extension test suite runs in Vitest's `node` environment rather than
 * jsdom so it needs no browser dependency. Zustand's `persist` middleware only
 * needs the synchronous `getItem` / `setItem` / `removeItem` contract, and the
 * tests read the stored payload through `localStorage` the same way a browser
 * would.
 */
class MemoryStorage {
  constructor() {
    this.store = new Map();
  }

  get length() {
    return this.store.size;
  }

  key(index) {
    return [...this.store.keys()][index] ?? null;
  }

  getItem(key) {
    const value = this.store.get(String(key));
    return value === undefined ? null : value;
  }

  setItem(key, value) {
    this.store.set(String(key), String(value));
  }

  removeItem(key) {
    this.store.delete(String(key));
  }

  clear() {
    this.store.clear();
  }
}

const storage = new MemoryStorage();

Object.defineProperty(globalThis, 'localStorage', {
  value: storage,
  configurable: true,
  writable: true,
});

// The store's safe-storage adapter looks for `window.localStorage` first.
if (typeof globalThis.window === 'undefined') {
  globalThis.window = { localStorage: storage };
}
