// What anyone may see without the PIN: books and diary entries Ada has
// published (an entry that is published is a blog post).
//
// Every save of a book or an entry updates this. A published one is listed in
// studio_public, pointing at the body just saved; for a book, the pictures it
// shows are listed in studio_public_images, and only those can be fetched by
// the public pages. Everything else (unpublished books, the diary, My Photos,
// the original photos behind drawings) stays behind the PIN.

export const PUBLIC_KINDS = ['book', 'entry'];

// The pictures a book shows on its pages: the line art (PNG, or the SVG of neat
// lines) and the colors. Not the other versions or the original photo.
export function publicImageIds(book) {
  const ids = new Set();
  const add = (image) => { for (const id of [image?.id, image?.vecId, image?.colorId]) if (typeof id === 'string') ids.add(id); };
  for (const page of book?.pages || []) {
    add(page.image);
    for (const panel of page.panels || []) add(panel.image);
  }
  return [...ids];
}

// After a book or an entry has been saved (or deleted): list it, or take it off.
export async function updatePublic(db, { id, kind, data, bodyKey, deleted }) {
  if (!PUBLIC_KINDS.includes(kind)) return;
  const published = !deleted && data?.published === true;
  const statements = [
    db.prepare('DELETE FROM studio_public WHERE id = ?1').bind(id),
    db.prepare('DELETE FROM studio_public_images WHERE doc_id = ?1').bind(id),
  ];
  if (published) {
    const at = Number.isFinite(data.publishedAt) ? data.publishedAt : Date.now();
    statements.push(db.prepare('INSERT INTO studio_public (id, kind, body_key, published_at) VALUES (?1, ?2, ?3, ?4)').bind(id, kind, bodyKey, at));
    if (kind === 'book') {
      for (const imageId of publicImageIds(data)) {
        statements.push(db.prepare('INSERT OR IGNORE INTO studio_public_images (image_id, doc_id) VALUES (?1, ?2)').bind(imageId, id));
      }
    }
  }
  await db.batch(statements);
}

// The published ones of a kind, newest first, each with its saved body and likes.
export async function listPublic(store, kind) {
  const { results } = await store.db.prepare(
    `SELECT p.id, p.body_key, p.published_at, (SELECT COUNT(*) FROM studio_likes l WHERE l.doc_id = p.id) AS likes
       FROM studio_public p WHERE p.kind = ?1 ORDER BY p.published_at DESC LIMIT 200`,
  ).bind(kind).all();
  const items = await Promise.all(results.map(async (row) => {
    const object = await store.bucket.get(row.body_key);
    return object ? { id: row.id, publishedAt: row.published_at, likes: row.likes, data: await object.json() } : null;
  }));
  return items.filter(Boolean);
}

export async function getPublic(store, kind, id) {
  const row = await store.db.prepare(
    `SELECT p.id, p.body_key, p.published_at, (SELECT COUNT(*) FROM studio_likes l WHERE l.doc_id = p.id) AS likes
       FROM studio_public p WHERE p.kind = ?1 AND p.id = ?2`,
  ).bind(kind, id).first();
  if (!row) return null;
  const object = await store.bucket.get(row.body_key);
  return object ? { id: row.id, publishedAt: row.published_at, likes: row.likes, data: await object.json() } : null;
}
