// Shared pieces for the studio's sync endpoints.
//
// Storage: the D1 database STUDIO_DB lists every synced document and its
// revision; the R2 bucket STUDIO_BUCKET holds the document bodies and the
// images. A "document" is a book or a photo waiting in the New Photos tray.
//
// Revisions come from one counter, so "everything changed since revision N"
// is a single query. Each save writes a new body object and leaves the old
// ones in place, which keeps a history of every version of every book.
//
// There is one shared library: everyone who gets past the access check sees
// and edits the same books.

export const DOC_KINDS = ['book', 'photo'];

const ID = /^[A-Za-z0-9_-]{8,64}$/;
export const validId = (id) => typeof id === 'string' && ID.test(id);

export const json = (body, status = 200) => Response.json(body, { status });

export function storage(env) {
  return env.STUDIO_DB && env.STUDIO_BUCKET ? { db: env.STUDIO_DB, bucket: env.STUDIO_BUCKET } : null;
}

export const notConfigured = () => json({ error: 'sync_not_configured' }, 503);

// The tables are created on first use, so setting up a new database is only
// "create it and bind it". Remembered per running instance.
let ready = null;
export function ensureSchema(db) {
  if (!ready) {
    ready = db.batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS studio_docs (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        rev INTEGER NOT NULL,
        deleted INTEGER NOT NULL DEFAULT 0,
        body_key TEXT,
        updated_at INTEGER NOT NULL
      )`),
      db.prepare('CREATE INDEX IF NOT EXISTS studio_docs_rev ON studio_docs (rev)'),
      db.prepare('CREATE TABLE IF NOT EXISTS studio_meta (key TEXT PRIMARY KEY, value INTEGER NOT NULL)'),
      db.prepare("INSERT OR IGNORE INTO studio_meta (key, value) VALUES ('rev', 0)"),
    ]).catch((error) => {
      ready = null;
      throw error;
    });
  }
  return ready;
}

// A row from studio_docs, with its body, in the shape the browser expects.
export async function readDoc(bucket, row) {
  let data = null;
  if (!row.deleted && row.body_key) {
    const object = await bucket.get(row.body_key);
    data = object ? await object.json() : null;
  }
  return { id: row.id, kind: row.kind, rev: row.rev, deleted: Boolean(row.deleted) || data === null, data };
}
