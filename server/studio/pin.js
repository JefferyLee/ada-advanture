// A PIN in front of the studio on the hostnames listed in STUDIO_PIN_HOSTS
// (the family's own domain), where Cloudflare Access is not used. The PIN is
// the secret STUDIO_PIN and is never in this repo. Entering it sets a cookie
// holding a hash of the PIN, so changing the PIN signs every device out.
// Wrong tries are counted per address in STUDIO_DB: ten in an hour and that
// address has to wait, so the PIN can't simply be guessed.

const COOKIE = 'studio_pin';
const KEEP_DAYS = 180;
const MAX_TRIES = 10;
const WINDOW_MS = 60 * 60 * 1000;

export const pinHost = (env, hostname) =>
  String(env.STUDIO_PIN_HOSTS || '').split(',').map((s) => s.trim()).filter(Boolean).includes(hostname);

async function pinHash(pin) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`ada-studio-pin:${pin}`));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Whether the request carries the cookie for the current PIN.
export async function hasPin(request, env) {
  if (!env.STUDIO_PIN) return false;
  const match = (request.headers.get('Cookie') || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([0-9a-f]{64})`));
  return Boolean(match) && match[1] === (await pinHash(env.STUDIO_PIN));
}

let triesTable = null;
function ensureTries(db) {
  if (!triesTable) {
    triesTable = db.prepare('CREATE TABLE IF NOT EXISTS studio_pin_tries (ip TEXT NOT NULL, at INTEGER NOT NULL)').run()
      .catch((error) => { triesTable = null; throw error; });
  }
  return triesTable;
}

// The page that asks for the PIN. Its notes are fixed text, never anything sent in.
const page = (status, note = '') => new Response(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ada's Studio</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f3eefe;
    font-family: ui-rounded, 'Avenir Next', system-ui, sans-serif; color: #1b1b2f; }
  form { background: #fff; border: 3px solid #1b1b2f; border-radius: 18px; padding: 32px 36px; margin: 16px;
    display: grid; gap: 14px; justify-items: center; box-shadow: 6px 6px 0 #6a3bc4; }
  h1 { margin: 0; font-size: 28px; }
  p { margin: 0; text-align: center; }
  input { font: inherit; font-size: 30px; letter-spacing: 8px; text-align: center; width: 9ch; padding: 8px 12px;
    border: 3px solid #1b1b2f; border-radius: 12px; }
  input:focus { outline: 3px solid #6a3bc4; outline-offset: 2px; }
  button { font: inherit; font-size: 20px; font-weight: 700; padding: 10px 28px; border: 3px solid #1b1b2f;
    border-radius: 12px; background: #ffd23f; cursor: pointer; }
  .note { color: #c22b2b; font-weight: 700; }
  .home { position: fixed; left: 16px; top: 14px; color: #1b1b2f; font-weight: 700; text-decoration: none; }
</style></head>
<body><a class="home" href="/">🏠 Home</a><form method="post">
  <h1>Secret PIN</h1>
  <p>Type the studio's secret PIN to come in.</p>
  <input name="pin" type="password" inputmode="numeric" autocomplete="off" maxlength="12" aria-label="PIN" autofocus required>
  ${note ? `<p class="note" role="alert">${note}</p>` : ''}
  <button>Open the Studio</button>
</form></body></html>`, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });

// GET shows the PIN page; POST checks the PIN, and the right one sets the
// cookie and goes on to the page that was asked for.
export async function pinPage(request, env) {
  if (request.method !== 'POST') return page(401);
  if (!env.STUDIO_PIN) return page(503, "The studio isn't ready yet. Ask a grown-up.");
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const now = Date.now();
  const db = env.STUDIO_DB;
  if (db) {
    await ensureTries(db);
    const { n } = await db.prepare('SELECT COUNT(*) AS n FROM studio_pin_tries WHERE ip = ? AND at > ?').bind(ip, now - WINDOW_MS).first();
    if (n >= MAX_TRIES) return page(429, 'Too many wrong tries. Wait a while, or ask a grown-up.');
  }
  const pin = String((await request.formData()).get('pin') || '').trim();
  if (pin !== env.STUDIO_PIN) {
    if (db) {
      await db.batch([
        db.prepare('INSERT INTO studio_pin_tries (ip, at) VALUES (?, ?)').bind(ip, now),
        db.prepare('DELETE FROM studio_pin_tries WHERE at <= ?').bind(now - WINDOW_MS),
      ]);
    }
    return page(401, "That's not it. Try again.");
  }
  const url = new URL(request.url);
  return new Response(null, {
    status: 303,
    headers: {
      Location: url.pathname + url.search,
      'Set-Cookie': `${COOKIE}=${await pinHash(env.STUDIO_PIN)}; Path=/; Max-Age=${KEEP_DAYS * 86400}; HttpOnly; Secure; SameSite=Lax`,
    },
  });
}
