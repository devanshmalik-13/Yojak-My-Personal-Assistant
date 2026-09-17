const DATABASE_NAME = "my-personal-assistant-local";
const DATABASE_VERSION = 1;
const SQLITE_STORE = "sqlite";
const FILE_STORE = "files";
const SQLITE_KEY = "primary";

function openStore(storeName: string, mode: IDBTransactionMode): Promise<IDBObjectStore> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(SQLITE_STORE)) database.createObjectStore(SQLITE_STORE);
      if (!database.objectStoreNames.contains(FILE_STORE)) database.createObjectStore(FILE_STORE);
    };
    request.onerror = () => reject(request.error ?? new Error("Unable to open local storage"));
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction(storeName, mode);
      transaction.oncomplete = () => database.close();
      transaction.onerror = () => reject(transaction.error ?? new Error("Local storage transaction failed"));
      resolve(transaction.objectStore(storeName));
    };
  });
}

async function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Local storage request failed"));
  });
}

export async function loadDatabaseBytes(): Promise<Uint8Array | undefined> {
  const store = await openStore(SQLITE_STORE, "readonly");
  const value = await requestResult<ArrayBuffer | Uint8Array | undefined>(store.get(SQLITE_KEY));
  if (!value) return undefined;
  return value instanceof Uint8Array ? value : new Uint8Array(value);
}

export async function saveDatabaseBytes(bytes: Uint8Array): Promise<void> {
  const store = await openStore(SQLITE_STORE, "readwrite");
  await requestResult(store.put(bytes.slice().buffer, SQLITE_KEY));
}

export async function putLocalFile(path: string, blob: Blob): Promise<void> {
  const store = await openStore(FILE_STORE, "readwrite");
  await requestResult(store.put(blob, path));
}

export async function getLocalFile(path: string): Promise<Blob | undefined> {
  const store = await openStore(FILE_STORE, "readonly");
  return requestResult<Blob | undefined>(store.get(path));
}

export async function deleteLocalFile(path: string): Promise<void> {
  const store = await openStore(FILE_STORE, "readwrite");
  await requestResult(store.delete(path));
}

export async function listLocalFiles(): Promise<{ path: string; blob: Blob }[]> {
  const store = await openStore(FILE_STORE, "readonly");
  const keys = await requestResult<IDBValidKey[]>(store.getAllKeys());
  const values = await requestResult<Blob[]>(store.getAll());
  return keys.map((path, index) => ({ path: String(path), blob: values[index]! }));
}

export async function clearLocalFiles(): Promise<void> {
  const store = await openStore(FILE_STORE, "readwrite");
  await requestResult(store.clear());
}

export async function clearBrowserPersistence(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DATABASE_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Unable to clear local storage"));
    request.onblocked = () => reject(new Error("Local storage is in use by another tab"));
  });
}
