// Checks the PIN in front of the studio on the family's own domain: the PIN
// page, the cookie, the limit on wrong tries, and that the PIN never opens the
// hostnames that use Cloudflare Access. Uses a made-up PIN and an in-memory
// stand-in for the database. No browser or server needed.
// Run:  node tests/studio/pin.mjs
import { onRequest as studioGate } from '../../functions/studio/_middleware.js';
import { onRequest as apiGate } from '../../functions/api/studio/_middleware.js';

let failed = 0;
const check = (ok, what, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? ` (${detail})` : ''}`);
  if (!ok) failed++;
};

// Just enough of D1 for the tries table.
function fakeDb() {
  const rows = [];
  const exec = (sql, [a, b] = []) => {
    if (sql.startsWith('SELECT')) return { n: rows.filter((r) => r.ip === a && r.at > b).length };
    if (sql.startsWith('INSERT')) rows.push({ ip: a, at: b });
    if (sql.startsWith('DELETE')) rows.splice(0, rows.length, ...rows.filter((r) => r.at > a));
    return null;
  };
  const statement = (sql, args) => ({ bind: (...a) => statement(sql, a), run: async () => exec(sql, args), first: async () => exec(sql, args) });
  return { prepare: (sql) => statement(sql, []), batch: (list) => Promise.all(list.map((s) => s.run())) };
}

const env = { STUDIO_PIN: '2468', STUDIO_PIN_HOSTS: 'adalovelace.app, www.adalovelace.app', STUDIO_DB: fakeDb(), ACCESS_TEAM_DOMAIN: 'team.example', ACCESS_AUD: 'aud' };
const NEXT = 'passed through';
const next = async () => new Response(NEXT);
const get = (url, cookie) => new Request(url, { headers: cookie ? { Cookie: cookie } : {} });
const post = (url, pin, ip = '1.2.3.4') => new Request(url, { method: 'POST', body: new URLSearchParams({ pin }), headers: { 'CF-Connecting-IP': ip } });
const through = async (res) => (await res.clone().text()) === NEXT;
const cookieOf = (res) => (res.headers.get('Set-Cookie') || '').split(';')[0];

const STUDIO = 'https://adalovelace.app/studio/';
const API = 'https://adalovelace.app/api/studio/sync?since=0';

// 1. The studio page asks for the PIN, and the right one lets you in.
{
  const ask = await studioGate({ request: get(STUDIO), env, next });
  check(ask.status === 401 && (await ask.text()).includes('Secret PIN'), 'the studio asks for the PIN');
  const wrong = await studioGate({ request: post(STUDIO, '1111'), env, next });
  check(wrong.status === 401 && (await wrong.text()).includes("That's not it"), 'a wrong PIN is turned away');
  const right = await studioGate({ request: post(STUDIO, '2468'), env, next });
  const setCookie = right.headers.get('Set-Cookie') || '';
  check(right.status === 303 && right.headers.get('Location') === '/studio/', 'the right PIN goes on to the studio');
  check(/HttpOnly/.test(setCookie) && /Secure/.test(setCookie) && !setCookie.includes('2468'), 'the cookie is HttpOnly, Secure, and not the PIN itself');
  const cookie = cookieOf(right);
  check(await through(await studioGate({ request: get(STUDIO, cookie), env, next })), 'with the cookie the studio opens');
  check(await through(await studioGate({ request: get('https://www.adalovelace.app/studio/', cookie), env, next })), 'on www too');

  // 2. The API wants the same cookie.
  const bare = await apiGate({ request: get(API), env, next });
  check(bare.status === 401 && (await bare.json()).error === 'pin_required', 'the API is closed without the PIN');
  check(await through(await apiGate({ request: get(API, cookie), env, next })), 'and open with it');
  check(!(await through(await apiGate({ request: get(API, 'studio_pin=' + '0'.repeat(64)), env, next }))), 'a made-up cookie does not open it');

  // 3. Changing the PIN signs everyone out.
  const changed = { ...env, STUDIO_PIN: '9753' };
  check(!(await through(await apiGate({ request: get(API, cookie), env: changed, next }))), 'a new PIN makes old cookies stop working');

  // 4. The PIN never opens a hostname that uses Access.
  const pages = await apiGate({ request: get('https://ada-advanture.pages.dev/api/studio/sync', cookie), env, next });
  check(pages.status === 401 && (await pages.json()).error === 'sign_in_required', 'pages.dev still needs Access, PIN or not');
  check(await through(await studioGate({ request: get('https://ada-advanture.pages.dev/studio/'), env, next })), 'and its studio page is left to Access');
}

// 5. Ten wrong tries from one address, then it has to wait; others are not affected.
{
  const local = { ...env, STUDIO_DB: fakeDb() };
  for (let i = 0; i < 10; i++) await studioGate({ request: post(STUDIO, String(1000 + i), '5.6.7.8'), env: local, next });
  const blocked = await studioGate({ request: post(STUDIO, '2468', '5.6.7.8'), env: local, next });
  check(blocked.status === 429, 'after ten wrong tries even the right PIN has to wait', `status ${blocked.status}`);
  const other = await studioGate({ request: post(STUDIO, '2468', '9.9.9.9'), env: local, next });
  check(other.status === 303, 'another address can still come in');
}

// 6. With no PIN set, nothing opens.
{
  const unset = { ...env, STUDIO_PIN: '' };
  check((await studioGate({ request: post(STUDIO, ''), env: unset, next })).status === 503, 'no PIN set: the page says it is not ready');
  check((await apiGate({ request: get(API, 'studio_pin=' + '0'.repeat(64)), env: unset, next })).status === 401, 'and the API stays closed');
}

if (failed) {
  console.log(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nall PIN checks passed');
