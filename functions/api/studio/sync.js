// GET /api/studio/sync?since=<revision>
//
// Everything that changed after the given revision, oldest first. The reply's
// `rev` is what to pass as `since` next time; `more` means ask again now.

import { ensureSchema, json, notConfigured, readDoc, storage } from '../../../server/studio/storage.js';

const PAGE = 40;

export async function onRequestGet({ request, env }) {
  const store = storage(env);
  if (!store) return notConfigured();
  await ensureSchema(store.db);

  const since = Math.max(0, Math.floor(Number(new URL(request.url).searchParams.get('since')) || 0));
  const { results } = await store.db
    .prepare('SELECT id, kind, rev, deleted, body_key FROM studio_docs WHERE rev > ?1 ORDER BY rev LIMIT ?2')
    .bind(since, PAGE + 1)
    .all();
  const rows = results.slice(0, PAGE);
  const docs = await Promise.all(rows.map((row) => readDoc(store.bucket, row)));
  return json({
    // Only as far as the last document handed over, never the counter's
    // current value, so nothing written a moment later can be skipped.
    rev: rows.length ? rows[rows.length - 1].rev : since,
    more: results.length > PAGE,
    docs,
  });
}
