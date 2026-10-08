// Original attachments kept on this device (IndexedDB), keyed by user so accounts sharing a
// browser never see each other's files. Failures are tolerated: the chat keeps the extracted text.

const DB = 'univa-files';
const STORE = 'files';
const key = (userId: string, id: string) => `${userId}:${id}`;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T> | void
): Promise<T | undefined> {
  const db = await open();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      const request = action(transaction.objectStore(STORE));
      transaction.oncomplete = () => resolve(request ? request.result : undefined);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

// Files waiting to be sent live in memory; they are copied to IndexedDB with the message.
const pending = new Map<string, Blob>();
export const holdFile = (id: string, blob: Blob) => pending.set(id, blob);

export async function saveFile(userId: string, id: string, blob: Blob) {
  pending.set(id, blob);
  await run('readwrite', (store) => {
    store.put(blob, key(userId, id));
  });
}

export async function loadFile(userId: string, id: string): Promise<Blob | null> {
  const held = pending.get(id);
  if (held) return held;
  try {
    const blob = await run<Blob>('readonly', (store) => store.get(key(userId, id)));
    return blob instanceof Blob ? blob : null;
  } catch {
    return null;
  }
}

/** Deletes this user's files that no saved message refers to any more. */
export async function pruneFiles(userId: string, keep: Set<string>) {
  const prefix = `${userId}:`;
  const keys = (await run<IDBValidKey[]>('readonly', (store) => store.getAllKeys())) ?? [];
  const stale = keys.filter(
    (k) => typeof k === 'string' && k.startsWith(prefix) && !keep.has(k.slice(prefix.length))
  );
  if (stale.length)
    await run('readwrite', (store) => {
      for (const k of stale) store.delete(k);
    });
}
