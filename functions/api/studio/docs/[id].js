// PUT /api/studio/docs/<id>
//
// Save a book or a photo entry. The body is
//   { kind, data, baseRev }            to save
//   { kind, deleted: true, baseRev }   to delete
// where baseRev is the revision the sender last saw (0 for something new).
// If someone else saved in between, nothing is changed and the reply is
// 409 with the current document, so the sender can keep both versions.

import {
  DOC_KINDS, ensureSchema, json, notConfigured, readDoc, storage, validId,
} from '../../../../server/studio/storage.js';

const MAX_BODY = 8 * 1024 * 1024;

export async function onRequestPut({ request, env, params }) {
  const store = storage(env);
  if (!store) return notConfigured();
  const { id } = params;
  if (!validId(id)) return json({ error: 'bad_id' }, 400);

  const text = await request.text();
  if (text.length > MAX_BODY) return json({ error: 'too_big' }, 413);
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const { kind } = body || {};
  const deleted = body?.deleted === true;
  const baseRev = Math.max(0, Math.floor(Number(body?.baseRev) || 0));
  if (!DOC_KINDS.includes(kind)) return json({ error: 'bad_kind' }, 400);
  if (!deleted && (typeof body.data !== 'object' || body.data === null)) return json({ error: 'bad_data' }, 400);

  await ensureSchema(store.db);

  // Write the body first under a new name, then point the row at it. A row
  // therefore never refers to a body that isn't there.
  let bodyKey = null;
  if (!deleted) {
    bodyKey = `docs/${id}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.json`;
    await store.bucket.put(bodyKey, JSON.stringify(body.data), { httpMetadata: { contentType: 'application/json' } });
  }

  // Both statements run as one transaction: take the next revision number,
  // then save only if the row is still at the revision the sender saw.
  const [, saved] = await store.db.batch([
    store.db.prepare("UPDATE studio_meta SET value = value + 1 WHERE key = 'rev'"),
    store.db.prepare(
      `INSERT INTO studio_docs (id, kind, rev, deleted, body_key, updated_at)
       VALUES (?1, ?2, (SELECT value FROM studio_meta WHERE key = 'rev'), ?3, ?4, ?5)
       ON CONFLICT(id) DO UPDATE SET
         rev = excluded.rev, deleted = excluded.deleted, body_key = excluded.body_key, updated_at = excluded.updated_at
       WHERE studio_docs.rev = ?6 AND studio_docs.kind = excluded.kind
       RETURNING rev`,
    ).bind(id, kind, deleted ? 1 : 0, bodyKey, Date.now(), baseRev),
  ]);

  const rev = saved.results?.[0]?.rev;
  if (rev) return json({ rev });

  // Someone else got there first. Drop the body just written and report what is there now.
  if (bodyKey) await store.bucket.delete(bodyKey);
  const row = await store.db
    .prepare('SELECT id, kind, rev, deleted, body_key FROM studio_docs WHERE id = ?1')
    .bind(id)
    .first();
  if (!row) return json({ error: 'save_failed' }, 500);
  return json({ error: 'changed_elsewhere', doc: await readDoc(store.bucket, row) }, 409);
}
