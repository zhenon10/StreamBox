import { yieldToMain } from '@/infrastructure/async/yieldToMain';

const DB_NAME = 'streambox-tv';
const DB_VERSION = 1;

export const IDBStore = {
  PlaylistMeta: 'playlist_meta',
  PlaylistChannels: 'playlist_channels',
} as const;

export type IDBStoreName = (typeof IDBStore)[keyof typeof IDBStore];

export interface PlaylistMetaRecord {
  readonly id: string;
  readonly name: string;
  readonly source: import('@/domain/entities').PlaylistSource;
  readonly categories: readonly import('@/domain/entities').Category[];
  readonly loadedAt: number;
  readonly channelCount: number;
}

export interface PlaylistChannelChunkRecord {
  readonly key: string;
  readonly playlistId: string;
  readonly chunkIndex: number;
  readonly channels: readonly import('@/domain/entities').Channel[];
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDBStore.PlaylistMeta)) {
        db.createObjectStore(IDBStore.PlaylistMeta, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(IDBStore.PlaylistChannels)) {
        const store = db.createObjectStore(IDBStore.PlaylistChannels, { keyPath: 'key' });
        store.createIndex('playlistId', 'playlistId', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
  });

  return dbPromise;
}

function runTransaction<T>(
  storeName: IDBStoreName,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDatabase().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        const request = operation(store);

        request.onsuccess = () => resolve(request.result as T);
        request.onerror = () => reject(request.error ?? new Error('IndexedDB operation failed'));
        tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
      }),
  );
}

export async function idbPut(storeName: IDBStoreName, value: unknown): Promise<void> {
  await runTransaction(storeName, 'readwrite', (store) => store.put(value));
}

export async function idbGet<T>(storeName: IDBStoreName, key: IDBValidKey): Promise<T | null> {
  const result = await runTransaction<T | undefined>(storeName, 'readonly', (store) =>
    store.get(key),
  );
  return result ?? null;
}

export async function idbDelete(storeName: IDBStoreName, key: IDBValidKey): Promise<void> {
  await runTransaction(storeName, 'readwrite', (store) => store.delete(key));
}

export async function idbGetAll<T>(storeName: IDBStoreName): Promise<T[]> {
  return runTransaction<T[]>(storeName, 'readonly', (store) => store.getAll());
}

export async function idbGetAllByIndex<T>(
  storeName: IDBStoreName,
  indexName: string,
  query: IDBValidKey,
): Promise<T[]> {
  return openDatabase().then(
    (db) =>
      new Promise<T[]>((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const index = store.index(indexName);
        const request = index.getAll(query);

        request.onsuccess = () => resolve(request.result as T[]);
        request.onerror = () => reject(request.error ?? new Error('IndexedDB index read failed'));
      }),
  );
}

export async function idbClearStore(storeName: IDBStoreName): Promise<void> {
  await runTransaction(storeName, 'readwrite', (store) => store.clear());
}

export function isIndexedDBAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

/** Channel chunks — 2000 channels per chunk keeps transactions fast on TV hardware. */
export const CHANNEL_CHUNK_SIZE = 2000;

export function chunkKey(playlistId: string, chunkIndex: number): string {
  return `${playlistId}::${String(chunkIndex)}`;
}

export async function deletePlaylistChannels(playlistId: string): Promise<void> {
  const chunks = await idbGetAllByIndex<PlaylistChannelChunkRecord>(
    IDBStore.PlaylistChannels,
    'playlistId',
    playlistId,
  );
  await openDatabase().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(IDBStore.PlaylistChannels, 'readwrite');
        const store = tx.objectStore(IDBStore.PlaylistChannels);
        for (const chunk of chunks) {
          store.delete(chunk.key);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('Failed to delete channel chunks'));
      }),
  );
}

export async function savePlaylistChannels(
  playlistId: string,
  channels: readonly import('@/domain/entities').Channel[],
): Promise<void> {
  await deletePlaylistChannels(playlistId);

  const chunkCount = Math.ceil(channels.length / CHANNEL_CHUNK_SIZE);
  if (chunkCount === 0) return;

  for (let i = 0; i < chunkCount; i++) {
    const start = i * CHANNEL_CHUNK_SIZE;
    const record: PlaylistChannelChunkRecord = {
      key: chunkKey(playlistId, i),
      playlistId,
      chunkIndex: i,
      channels: channels.slice(start, start + CHANNEL_CHUNK_SIZE),
    };
    await idbPut(IDBStore.PlaylistChannels, record);
    await yieldToMain();
  }
}

export async function loadPlaylistChannels(
  playlistId: string,
): Promise<readonly import('@/domain/entities').Channel[]> {
  const chunks = await idbGetAllByIndex<PlaylistChannelChunkRecord>(
    IDBStore.PlaylistChannels,
    'playlistId',
    playlistId,
  );

  return chunks
    .sort((a, b) => a.chunkIndex - b.chunkIndex)
    .flatMap((chunk) => chunk.channels);
}
