// GET /api/public/entries   Ada's blog: the diary entries she has published, newest first.

import { ensureSchema, notConfigured, storage } from '../../../server/studio/storage.js';
import { listPublic } from '../../../server/studio/public.js';

export async function onRequestGet({ env }) {
  const store = storage(env);
  if (!store) return notConfigured();
  await ensureSchema(store.db);
  return Response.json(await listPublic(store, 'entry'), { headers: { 'Cache-Control': 'no-store' } });
}
