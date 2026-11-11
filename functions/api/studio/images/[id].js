// PUT /api/studio/images/<id>   store a picture (the request body is the file)
// GET /api/studio/images/<id>   fetch it
//
// Pictures never change once stored: every new version of a drawing gets a
// new id. So a second PUT to the same id is ignored, and a fetched picture
// can be cached for good.

import { json, notConfigured, storage, validId } from '../../../../server/studio/storage.js';

const TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_IMAGE = 12 * 1024 * 1024;
const keyOf = (id) => `images/${id}`;

export async function onRequestPut({ request, env, params }) {
  const store = storage(env);
  if (!store) return notConfigured();
  if (!validId(params.id)) return json({ error: 'bad_id' }, 400);
  const type = (request.headers.get('content-type') || '').split(';')[0].trim();
  if (!TYPES.includes(type)) return json({ error: 'bad_type' }, 415);

  const key = keyOf(params.id);
  if (await store.bucket.head(key)) return json({ ok: true, existed: true });

  const bytes = await request.arrayBuffer();
  if (bytes.byteLength === 0) return json({ error: 'empty' }, 400);
  if (bytes.byteLength > MAX_IMAGE) return json({ error: 'too_big' }, 413);
  await store.bucket.put(key, bytes, { httpMetadata: { contentType: type } });
  return json({ ok: true }, 201);
}

export async function onRequestGet({ env, params }) {
  const store = storage(env);
  if (!store) return notConfigured();
  if (!validId(params.id)) return json({ error: 'bad_id' }, 400);
  const object = await store.bucket.get(keyOf(params.id));
  if (!object) return json({ error: 'not_found' }, 404);
  return new Response(object.body, {
    headers: {
      'content-type': object.httpMetadata?.contentType || 'application/octet-stream',
      'cache-control': 'private, max-age=31536000, immutable',
      etag: object.httpEtag,
    },
  });
}
