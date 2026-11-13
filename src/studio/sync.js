// Keeps this device and the server in step, in the background.
//
// Each round first pulls what changed on the server, then pushes what changed
// here. A book changed in both places is never merged or overwritten: the
// server's version takes the book's place and this device's version is kept
// as a new book marked "(copy)", so no work is lost and the child can see
// what happened.
//
// If the server has no sync set up (or isn't reachable at all, as with the
// plain dev server), syncing switches itself off and the app works from this
// device alone.

import { newId } from './model.js';
import * as store from './store.js';

const API = '/api/studio';

class SyncOff extends Error {}

const idsOf = (image) => (image
  ? [image.id, image.vecId, image.origId, image.colorId, image.alt?.id, image.alt?.vecId,
    ...(image.versions || []).flatMap((v) => [v.id, v.vecId])].filter(Boolean)
  : []);

// Every picture a document refers to.
function imagesIn(kind, data) {
  if (kind === 'photo') return [data.imageId];
  const ids = [];
  for (const page of data.pages || []) {
    ids.push(...idsOf(page.image));
    for (const panel of page.panels || []) ids.push(...idsOf(panel.image));
  }
  return ids;
}

async function uploadImages(ids) {
  for (const id of ids) {
    if (await store.getMeta(`img:${id}`)) continue;
    const blob = await store.getImage(id);
    if (!blob) continue; // not on this device, so it came from the server
    const res = await fetch(`${API}/images/${id}`, {
      method: 'PUT',
      headers: { 'content-type': blob.type || 'image/png' },
      body: blob,
    });
    if (!res.ok) throw new Error(`image upload failed: ${res.status}`);
    await store.setMeta(`img:${id}`, 1);
  }
}

// Take in one document from the server. `out` collects what changed.
async function takeRemote(doc, out) {
  const meta = await store.getMeta(`${doc.kind}:${doc.id}`);
  if (meta && meta.rev === doc.rev) return; // already have exactly this

  if (doc.kind === 'book' && meta?.dirty && !meta.deleted) {
    // Changed here and on another device. Keep this device's version as a copy.
    const mine = await store.getDoc('book', doc.id);
    if (mine) {
      const copy = {
        ...structuredClone(mine),
        id: newId(),
        title: `${mine.title.trim() || `Episode ${mine.number}`} (copy)`.slice(0, 60),
        updatedAt: Date.now(),
      };
      await store.saveBook(copy);
      out.copies.push({ from: doc.id, to: copy.id });
    }
  }
  await store.applyRemote(doc.kind, doc.id, doc.deleted ? null : doc.data, doc.rev);
  out.changed.push(`${doc.kind}:${doc.id}`);
}

async function pull(out) {
  let since = (await store.getMeta('lastRev')) || 0;
  for (;;) {
    let res;
    try {
      res = await fetch(`${API}/sync?since=${since}`);
    } catch {
      throw new Error('offline');
    }
    if ([401, 403, 404, 503].includes(res.status)) throw new SyncOff();
    if (!res.ok) throw new Error(`pull failed: ${res.status}`);
    // A server without the sync API (the plain dev server) answers with a web page.
    if (!(res.headers.get('content-type') || '').includes('application/json')) throw new SyncOff();
    const body = await res.json();
    for (const doc of body.docs) await takeRemote(doc, out);
    since = body.rev;
    await store.setMeta('lastRev', since);
    if (!body.more) return;
  }
}

async function push(out) {
  for (const { kind, id, meta } of await store.listDirty()) {
    let payload;
    if (meta.deleted) {
      payload = { kind, deleted: true, baseRev: meta.rev };
    } else {
      const data = await store.getDoc(kind, id);
      if (!data) continue;
      await uploadImages(imagesIn(kind, data));
      payload = { kind, data, baseRev: meta.rev };
    }
    const res = await fetch(`${API}/docs/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      await store.markSent(kind, id, (await res.json()).rev, meta.v);
    } else if (res.status === 409) {
      await takeRemote((await res.json()).doc, out);
      out.again = true; // a copy was made and needs sending
    } else {
      throw new Error(`push failed: ${res.status}`);
    }
  }
}

// onEvent gets { type: 'status', status } with status one of
//   'off' | 'syncing' | 'synced' | 'waiting' (changes here couldn't be sent yet)
// and { type: 'changed', changed: [...], copies: [{ from, to }] } when a round
// brought in something new.
export function createSync(onEvent) {
  let off = false;
  let running = false;
  let again = false;
  let soon = null;

  async function round() {
    if (off) return;
    if (running) { again = true; return; }
    running = true;
    const out = { changed: [], copies: [], again: false };
    let status = 'synced';
    try {
      if ((await store.listDirty()).length) onEvent({ type: 'status', status: 'syncing' });
      await pull(out);
      await push(out);
    } catch (error) {
      if (error instanceof SyncOff) { off = true; status = 'off'; } else status = 'waiting';
    }
    if (status === 'synced' && (await store.listDirty()).length) status = 'waiting';
    if (out.changed.length || out.copies.length) onEvent({ type: 'changed', changed: out.changed, copies: out.copies });
    onEvent({ type: 'status', status });
    running = false;
    if ((again || out.again) && !off) { again = false; round(); }
  }

  return {
    now: round,
    // After a local save: wait a moment so a burst of typing goes up as one save.
    soon() {
      clearTimeout(soon);
      soon = setTimeout(round, 1500);
    },
    stop() { clearTimeout(soon); off = true; },
  };
}
