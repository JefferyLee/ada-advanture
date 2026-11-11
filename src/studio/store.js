// Local storage for books and images, in the browser's IndexedDB.
// Books are small JSON; images are Blobs kept in their own store so saving a
// page after every keystroke never rewrites picture data.

const DB_NAME = 'ada-studio';
const DB_VERSION = 1;

let dbPromise = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('books')) db.createObjectStore('books', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('images')) db.createObjectStore('images');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function run(storeName, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const req = fn(tx.objectStore(storeName));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function listBooks() {
  const books = await run('books', 'readonly', (s) => s.getAll());
  return books.sort((a, b) => b.number - a.number);
}

export const putBook = (book) => run('books', 'readwrite', (s) => s.put(book));
export const deleteBook = (id) => run('books', 'readwrite', (s) => s.delete(id));
export const putImage = (id, blob) => run('images', 'readwrite', (s) => s.put(blob, id));
export const getImage = (id) => run('images', 'readonly', (s) => s.get(id));

// Object URLs for stored images, created once per image id.
const urlCache = new Map();

export async function imageUrl(id) {
  if (!urlCache.has(id)) {
    urlCache.set(id, getImage(id).then((blob) => (blob ? URL.createObjectURL(blob) : null)));
  }
  return urlCache.get(id);
}
