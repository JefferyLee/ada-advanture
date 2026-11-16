// GET /api/public/images/<id>   a picture shown in a published episode. Any
// other picture is 404 here; the studio's own pictures need the PIN.

import { ensureSchema, json, notConfigured, storage, validId } from '../../../../server/studio/storage.js';

export async function onRequestGet({ env, params }) {
  const store = storage(env);
  if (!store) return notConfigured();
  if (!validId(params.id)) return json({ error: 'bad_id' }, 400);
  await ensureSchema(store.db);
  const listed = await store.db.prepare('SELECT 1 FROM studio_public_images WHERE image_id = ?1 LIMIT 1').bind(params.id).first();
  const object = listed && await store.bucket.get(`images/${params.id}`);
  if (!object) return json({ error: 'not_found' }, 404);
  return new Response(object.body, {
    headers: {
      'content-type': object.httpMetadata?.contentType || 'application/octet-stream',
      // Short, so a picture taken off the public pages stops showing soon.
      'cache-control': 'public, max-age=600',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      'x-content-type-options': 'nosniff',
      etag: object.httpEtag,
    },
  });
}
