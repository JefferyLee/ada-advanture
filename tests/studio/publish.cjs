// Browser test: publishing. An episode published in the Drawing Studio shows on
// /comics/, a diary page put on the blog in the Writing Studio shows on /blog/,
// both can be liked once, and both disappear again when taken off. Also checks
// through the API that nothing unpublished (nor a drawing's original photo) can
// be fetched without the PIN.
// Run:  npm run studio:local      (in another terminal; a local database and bucket)
//       node tests/studio/publish.cjs
// Needs Playwright:  npm i -D playwright && npx playwright install chromium
// Screenshots go to the folder in SHOTS_DIR (default: the system temp folder).
const { chromium } = require('playwright');
const S = process.env.SHOTS_DIR || require('os').tmpdir();
const U = process.env.STUDIO_BASE || 'http://localhost:8788';
const log = (...a) => console.log(...a);
let failed = 0;
const check = (ok, what, detail = '') => { log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? ` (${detail})` : ''}`); if (!ok) failed++; };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  const api = (path, init) => page.evaluate(async ([p, i]) => { const r = await fetch(p, i); return { status: r.status, body: r.headers.get('content-type')?.includes('json') ? await r.json() : null }; }, [path, init]);
  // A save is sent a moment after it is made; wait until the server has it.
  const sent = async () => {
    await page.waitForFunction(() => !/Saved on all devices/.test(document.querySelector('.gn-saved')?.textContent || ''), null, { timeout: 3000 }).catch(() => {});
    await page.waitForFunction(() => /Saved on all devices/.test(document.querySelector('.gn-saved')?.textContent || ''), null, { timeout: 20000 });
  };
  const title = `Escape ${Date.now() % 100000}`;

  // 1. An episode, published from the editor.
  await page.goto(`${U}/studio/`);
  await page.getByRole('button', { name: 'New Episode' }).click();
  await page.getByRole('textbox', { name: 'Character name' }).click();
  await page.keyboard.type('Peni');
  await page.locator('#gn-book-title').fill(title);
  await sent();
  let books = (await api('/api/public/books')).body;
  check(!books.some((b) => b.data.title === title), 'an episode is not public until it is published');
  await page.getByRole('button', { name: /Publish/ }).click();
  await sent();
  books = (await api('/api/public/books')).body;
  const mine = books.find((b) => b.data.title === title);
  check(Boolean(mine), 'Publish puts it on the public comics', `${books.length} published`);

  const comics = await ctx.newPage();
  await comics.goto(`${U}/comics/#${mine.id}`);
  await comics.waitForSelector('.rd-book .gn-page');
  const fits = await comics.evaluate(() => document.querySelector('.rd-book .rd-page').getBoundingClientRect().right >= document.querySelector('.rd-book .gn-page').getBoundingClientRect().right - 1);
  check((await comics.locator('.rd-book-title').textContent()).includes(title) && fits, '/comics/ shows it, page fitted to the width');
  await comics.locator('.rd-like').click();
  await comics.waitForTimeout(400);
  const likes1 = (await api(`/api/public/likes/${mine.id}`, { method: 'POST' })).body.likes;
  check(likes1 === mine.likes + 1, 'a like counts once per visitor', `${mine.likes} -> ${likes1}`);
  await comics.screenshot({ path: `${S}/shot-public-comic.png` });

  // 2. A diary page: private, then on the blog.
  await page.getByRole('button', { name: 'My Books' }).click();
  await page.getByRole('button', { name: /Writing Studio/ }).click();
  await page.getByRole('button', { name: 'New Page' }).click();
  await page.getByRole('textbox', { name: 'Title' }).fill(title);
  await page.getByRole('textbox', { name: 'Your writing' }).fill('Today I drew Peni.\nShe can fly!');
  await sent();
  let posts = (await api('/api/public/entries')).body;
  check(!posts.some((p) => p.data.title === title), 'a diary page stays private');
  await page.getByRole('button', { name: /Put It On My Blog/ }).click();
  await sent();
  const blog = await ctx.newPage();
  await blog.goto(`${U}/blog/`);
  await blog.waitForSelector('.rd-post');
  check((await blog.locator('.rd-post-title').allTextContents()).includes(title), 'Put It On My Blog puts it on /blog/');
  await blog.screenshot({ path: `${S}/shot-public-blog.png` });

  // 3. Taken off again.
  await page.getByRole('button', { name: /Take It Off My Blog/ }).click();
  await sent();
  posts = (await api('/api/public/entries')).body;
  check(!posts.some((p) => p.data.title === title), 'Take It Off My Blog takes it off');
  await page.getByRole('button', { name: /Drawing Studio/ }).click();
  await page.locator('.gn-cover-title', { hasText: title }).click();
  await page.getByRole('button', { name: /Published/ }).click();
  await sent();
  books = (await api('/api/public/books')).body;
  check(!books.some((b) => b.data.title === title), 'unpublishing takes the episode off');
  check((await api(`/api/public/likes/${mine.id}`, { method: 'POST' })).status === 404, 'and it can no longer be liked');

  // 4. Pictures: only the ones a published episode shows, never its original photo.
  // (Browsers may keep a public picture for a few minutes, so each check asks the server.)
  const pic = (id) => api(`/api/public/images/${id}`, { cache: 'no-store' });
  const png = [137, 80, 78, 71, 13, 10, 26, 10, 0, 0];
  const put = (id) => page.evaluate(async ([i, bytes]) => (await fetch(`/api/studio/images/${i}`, { method: 'PUT', headers: { 'content-type': 'image/png' }, body: new Uint8Array(bytes) })).status, [id, png]);
  const stamp = Date.now();
  const [shown, orig, bookId] = [`shown_${stamp}`, `orig_${stamp}`, `book_${stamp}`];
  await put(shown); await put(orig);
  const doc = (published, baseRev) => ({ method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'book', baseRev, data: { id: bookId, number: 99, title: 'pictures', published, pages: [{ id: 'p', type: 'card', image: { id: shown, origId: orig, w: 1, h: 1 } }] } }) });
  const r1 = (await api(`/api/studio/docs/${bookId}`, doc(false, 0))).body.rev;
  check((await pic(shown)).status === 404, "a picture in an unpublished episode can't be fetched");
  const r2 = (await api(`/api/studio/docs/${bookId}`, doc(true, r1))).body.rev;
  check((await pic(shown)).status === 200, 'once published, the picture it shows can');
  check((await pic(orig)).status === 404, 'but never the original photo behind it');
  await api(`/api/studio/docs/${bookId}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'book', baseRev: r2, deleted: true }) });
  check((await pic(shown)).status === 404, 'deleting the episode takes its pictures off too');

  log('errors:', errors.length ? errors : 'none');
  await browser.close();
  if (failed) { log(`\n${failed} check(s) failed`); process.exit(1); }
  log('\nall publishing checks passed');
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
