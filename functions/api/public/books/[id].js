// GET /api/public/books/<id>   one published episode (404 if it isn't published).

import { ensureSchema, json, notConfigured, storage, validId } from '../../../../server/studio/storage.js';
import { getPublic } from '../../../../server/studio/public.js';

export async function onRequestGet({ env, params }) {
  const store = storage(env);
  if (!store) return notConfigured();
  if (!validId(params.id)) return json({ error: 'bad_id' }, 400);
  await ensureSchema(store.db);
  const book = await getPublic(store, 'book', params.id);
  return book ? Response.json(book, { headers: { 'Cache-Control': 'no-store' } }) : json({ error: 'not_found' }, 404);
}
