// Local storage, in the browser's IndexedDB. Everything is saved here first;
// sync.js copies it to and from the server in the background.
//
// Stores:
//   books   one record per book (plain JSON)
//   photos  photos waiting in the New Photos tray: { id, imageId, createdAt }
//   images  picture files (Blobs) by id, kept apart so saving a page after
//           every keystroke never rewrites picture data
//   meta    sync bookkeeping:
//             "book:<id>" / "photo:<id>"  { rev, v, dirty, deleted }
//                rev      the server revision this copy is based on (0 = never sent)
//                v        counts local saves, to notice a save made during an upload
//                dirty    has changes the server doesn't have yet
//                deleted  deleted here (or on the server)
//             "img:<id>"  1 once the picture is known to be on the server
//             "lastRev"   how far this device has caught up with the server

const DB_NAME = 'ada-studio';
const DB_VERSION = 2;
const STORE_OF = { book: 'books', photo: 'photos' };

let dbPromise = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        const have = db.objectStoreNames;
        if (!have.contains('books')) db.createObjectStore('books', { keyPath: 'id' });
        if (!have.contains('photos')) db.createObjectStore('photos', { keyPath: 'id' });
        if (!have.contains('images')) db.createObjectStore('images');
        if (!have.contains('meta')) db.createObjectStore('meta');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

const wait = (request) => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

// Run `work` inside one transaction. Inside it, only await `wait(...)` on
// requests from the given stores: awaiting anything else lets the transaction close.
async function inStores(names, mode, work) {
  const db = await openDb();
  const tx = db.transaction(names, mode);
  const done = new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  const result = await work((name) => tx.objectStore(name));
  await done;
  return result;
}

// ---- Documents: books and photos ----

export const listBooks = async () =>
  (await inStores(['books'], 'readonly', (s) => wait(s('books').getAll()))).sort((a, b) => b.number - a.number);

export const listPhotos = async () =>
  (await inStores(['photos'], 'readonly', (s) => wait(s('photos').getAll()))).sort((a, b) => b.createdAt - a.createdAt);

export const getDoc = (kind, id) => inStores([STORE_OF[kind]], 'readonly', (s) => wait(s(STORE_OF[kind]).get(id)));

// A change made on this device: store it and mark it as needing to be sent.
function saveLocal(kind, doc) {
  return inStores([STORE_OF[kind], 'meta'], 'readwrite', async (s) => {
    const key = `${kind}:${doc.id}`;
    const m = (await wait(s('meta').get(key))) || { rev: 0, v: 0 };
    s(STORE_OF[kind]).put(doc);
    s('meta').put({ rev: m.rev, v: m.v + 1, dirty: true, deleted: false }, key);
  });
}

function removeLocal(kind, id) {
  return inStores([STORE_OF[kind], 'meta'], 'readwrite', async (s) => {
    const key = `${kind}:${id}`;
    const m = await wait(s('meta').get(key));
    s(STORE_OF[kind]).delete(id);
    // Something the server never saw can simply be forgotten.
    if (!m || m.rev === 0) s('meta').delete(key);
    else s('meta').put({ rev: m.rev, v: m.v + 1, dirty: true, deleted: true }, key);
  });
}

export const saveBook = (book) => saveLocal('book', book);
export const removeBook = (id) => removeLocal('book', id);
export const savePhoto = (photo) => saveLocal('photo', photo);
export const removePhoto = (id) => removeLocal('photo', id);

// ---- For sync.js ----

export const getMeta = (key) => inStores(['meta'], 'readonly', (s) => wait(s('meta').get(key)));
export const setMeta = (key, value) => inStores(['meta'], 'readwrite', (s) => { s('meta').put(value, key); });

// Every book or photo with changes still to send: [{ kind, id, meta }].
export function listDirty() {
  return inStores(['meta'], 'readonly', async (s) => {
    const keys = await wait(s('meta').getAllKeys());
    const values = await wait(s('meta').getAll());
    const out = [];
    keys.forEach((key, i) => {
      const cut = String(key).indexOf(':');
      const kind = String(key).slice(0, cut);
      if (STORE_OF[kind] && values[i]?.dirty) out.push({ kind, id: String(key).slice(cut + 1), meta: values[i] });
    });
    return out;
  });
}

// The server's copy replaces the local one (or removes it, when data is null).
export function applyRemote(kind, id, data, rev) {
  return inStores([STORE_OF[kind], 'meta'], 'readwrite', async (s) => {
    const key = `${kind}:${id}`;
    const m = (await wait(s('meta').get(key))) || { v: 0 };
    if (data) s(STORE_OF[kind]).put(data);
    else s(STORE_OF[kind]).delete(id);
    s('meta').put({ rev, v: m.v, dirty: false, deleted: !data }, key);
  });
}

// After a successful upload: record the new revision. If the document was
// saved again while it was being sent, it stays marked as needing to be sent.
export function markSent(kind, id, rev, sentV) {
  return inStores(['meta'], 'readwrite', async (s) => {
    const key = `${kind}:${id}`;
    const m = await wait(s('meta').get(key));
    if (m) s('meta').put({ ...m, rev, dirty: m.v !== sentV }, key);
  });
}

// ---- Pictures ----

export const putImage = (id, blob) => inStores(['images'], 'readwrite', (s) => { s('images').put(blob, id); });
export const getImage = (id) => inStores(['images'], 'readonly', (s) => wait(s('images').get(id)));

// A picture's file: from this device if it is here, otherwise fetched from
// the server and kept for next time. Null if it can't be had right now.
export async function imageBlob(id) {
  const local = await getImage(id);
  if (local) return local;
  try {
    const res = await fetch(`/api/studio/images/${id}`);
    if (!res.ok || !(res.headers.get('content-type') || '').startsWith('image/')) return null;
    const blob = await res.blob();
    await putImage(id, blob);
    await setMeta(`img:${id}`, 1);
    return blob;
  } catch {
    return null;
  }
}

// Object URLs for pictures, made once per id. A miss isn't remembered, so a
// picture that couldn't be fetched while offline loads once the network is back.
const urlCache = new Map();

export function imageUrl(id) {
  if (!urlCache.has(id)) {
    const pending = imageBlob(id).then((blob) => {
      if (!blob) urlCache.delete(id);
      return blob ? URL.createObjectURL(blob) : null;
    });
    urlCache.set(id, pending);
  }
  return urlCache.get(id);
}
