// POST /api/public/likes/<id>   like a published episode or blog post.
// Each visitor counts once per item: the server keeps a hash of their address
// with the item's id, never the address itself. Replies with the new count.

import { ensureSchema, json, notConfigured, storage, validId } from '../../../../server/studio/storage.js';

async function visitor(request, id) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`ada-like:${id}:${ip}`));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function onRequestPost({ request, env, params }) {
  const store = storage(env);
  if (!store) return notConfigured();
  if (!validId(params.id)) return json({ error: 'bad_id' }, 400);
  await ensureSchema(store.db);
  const published = await store.db.prepare('SELECT 1 FROM studio_public WHERE id = ?1').bind(params.id).first();
  if (!published) return json({ error: 'not_found' }, 404);
  await store.db.prepare('INSERT OR IGNORE INTO studio_likes (doc_id, who) VALUES (?1, ?2)').bind(params.id, await visitor(request, params.id)).run();
  const { n } = await store.db.prepare('SELECT COUNT(*) AS n FROM studio_likes WHERE doc_id = ?1').bind(params.id).first();
  return json({ likes: n });
}
