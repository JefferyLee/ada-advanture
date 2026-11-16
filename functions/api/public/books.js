// GET /api/public/books   the episodes Ada has published, newest first.
// No PIN: this is what the public comics page shows.

import { ensureSchema, notConfigured, storage } from '../../../server/studio/storage.js';
import { listPublic } from '../../../server/studio/public.js';

export async function onRequestGet({ env }) {
  const store = storage(env);
  if (!store) return notConfigured();
  await ensureSchema(store.db);
  return Response.json(await listPublic(store, 'book'), { headers: { 'Cache-Control': 'no-store' } });
}
