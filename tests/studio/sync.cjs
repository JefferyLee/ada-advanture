// Browser test: two devices and a third fresh one against the sync server (books, pictures,
// an offline conflict that keeps both, the New Photos tray, deleting).
// Needs an EMPTY local server each run, with the access check off:
//       echo STUDIO_DEV_NO_AUTH=1 >> .dev.vars      (once)
//       rm -rf .wrangler/state && npm run studio:local      (in another terminal)
//       node tests/studio/sync.cjs
// Needs Playwright:  npm i -D playwright && npx playwright install chromium
// Screenshots go to the folder in SHOTS_DIR (default: the system temp folder).
const { chromium } = require('playwright');
const S = process.env.SHOTS_DIR || require('os').tmpdir();
const log = (...a) => console.log(...a);
const URL = (process.env.STUDIO_URL || 'http://localhost:8788/studio/');
(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const device = async (name, viewport) => {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${name} pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_INTERNET_DISCONNECTED/.test(m.text())) errors.push(`${name} console: ${m.text()}`); });
    page.on('dialog', (d) => d.accept());
    const stage = page.locator('.gn-stage');
    return {
      ctx, page, stage,
      label: () => page.locator('.gn-saved').textContent().then((t) => t.trim()),
      synced: () => page.waitForFunction(() => /all devices/.test(document.querySelector('.gn-saved')?.textContent || ''), null, { timeout: 15000 }),
      poke: () => page.evaluate(() => window.dispatchEvent(new Event('online'))),
      box: (label) => stage.getByRole('textbox', { name: label }).first(),
      titles: () => page.locator('.gn-cover-title').allTextContents(),
    };
  };
  const mac = await device('iMac', { width: 1440, height: 960 });
  const pad = await device('iPad', { width: 1180, height: 820 });

  const photoUrl = await mac.page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 1800; c.height = 1300; const x = c.getContext('2d');
    x.fillStyle = '#5f4630'; x.fillRect(0, 0, c.width, c.height);
    x.setTransform(1, 0.05, -0.06, 1, 260, 120); x.fillStyle = '#f1ecde'; x.fillRect(0, 0, 1300, 950);
    x.strokeStyle = '#34343f'; x.lineWidth = 9; x.beginPath(); x.arc(650, 380, 200, 0, 7); x.stroke(); x.beginPath(); x.rect(420, 620, 460, 220); x.stroke();
    return c.toDataURL('image/jpeg', 0.9);
  });
  const photo = (name) => ({ name, mimeType: 'image/jpeg', buffer: Buffer.from(photoUrl.split(',')[1], 'base64') });

  // 1. Make a book on the iMac
  await mac.page.goto(URL);
  await mac.page.getByRole('button', { name: 'New Episode' }).click();
  await mac.page.locator('#gn-book-title').fill('Wormy vs. The Fog');
  await mac.box('Character name').click(); await mac.page.keyboard.type('WORMY');
  await mac.box('POWERS text').click(); await mac.page.keyboard.type('Can dig really fast');
  const [ch] = await Promise.all([mac.page.waitForEvent('filechooser'), mac.page.getByRole('button', { name: 'Add your drawing' }).click()]);
  await ch.setFiles(photo('wormy.jpg'));
  await mac.page.waitForFunction(() => { const c = document.querySelectorAll('.gn-import-view canvas')[1]; return c && c.width > 100; });
  await mac.page.waitForTimeout(400);
  await mac.page.getByRole('button', { name: 'Looks Good!' }).click();
  await mac.stage.locator('.gn-portrait img').first().waitFor();
  await mac.page.locator('.gn-panel').getByRole('button', { name: 'Color It' }).click();
  await mac.page.waitForFunction(() => { const c = document.querySelector('.gn-color-canvas'); return c && c.style.visibility === 'visible'; });
  const cb = await mac.page.locator('.gn-color-canvas').boundingBox();
  await mac.page.mouse.click(cb.x + cb.width * 0.5, cb.y + cb.height * 0.3);
  await mac.page.locator('.gn-color').getByRole('button', { name: 'Done' }).click();
  await mac.synced();
  log('1 iMac made a book. Status:', await mac.label());

  // 2. It shows up on the iPad, pictures and all
  await pad.page.goto(URL);
  await pad.page.locator('.gn-cover-title', { hasText: 'Fog' }).waitFor({ timeout: 15000 });
  await pad.page.locator('.gn-cover-title', { hasText: 'Fog' }).click();
  await pad.stage.locator('.gn-portrait img').nth(1).waitFor();
  const imgs = await pad.stage.locator('.gn-portrait img').evaluateAll((els) => Promise.all(els.map((e) => new Promise((r) => { const d = () => r(e.naturalWidth); e.complete ? d() : (e.onload = d); }))));
  log('2 iPad opened it: name', await pad.box('Character name').textContent(), '| powers:', await pad.box('POWERS text').textContent(), '| drawing layers fetched (widths):', imgs.join(','));

  // 3. An edit on the iPad reaches the iMac while its editor is open
  await pad.box('WEAKNESS text').click(); await pad.page.keyboard.type('Birds.');
  await pad.synced();
  await mac.poke();
  await mac.page.waitForFunction(() => /Birds/.test(document.querySelector('.gn-stage [aria-label="WEAKNESS text"]')?.textContent || ''), null, { timeout: 15000 });
  log('3 iMac sees the iPad edit without reloading:', await mac.box('WEAKNESS text').textContent(), '| name still there:', await mac.box('Character name').textContent());

  // 4. Both change the same book while the iMac is offline: keep both
  await mac.ctx.setOffline(true);
  await mac.box('ABOUT text').click(); await mac.page.keyboard.type('From the iMac');
  await mac.page.waitForFunction(() => /this device/.test(document.querySelector('.gn-saved')?.textContent || ''), null, { timeout: 15000 });
  log('4 iMac offline, edited. Status:', await mac.label());
  await pad.poke(); await pad.page.waitForTimeout(600);
  await pad.box('ABOUT text').click(); await pad.page.keyboard.type('From the iPad');
  await pad.synced();
  await mac.ctx.setOffline(false);
  await mac.poke();
  await mac.page.locator('.gn-toast').waitFor({ timeout: 15000 });
  log('  iMac back online. Message:', await mac.page.locator('.gn-toast span').textContent());
  log('  iMac is now in:', await mac.page.locator('#gn-book-title').inputValue(), '| about:', await mac.box('ABOUT text').textContent());
  await mac.page.locator('.gn-toast').getByRole('button', { name: 'OK' }).click();
  await mac.synced();
  await mac.page.getByRole('button', { name: 'My Books' }).click();
  log('  iMac shelf:', JSON.stringify(await mac.titles()));
  await pad.page.getByRole('button', { name: 'My Books' }).click();
  await pad.poke();
  await pad.page.waitForFunction(() => document.querySelectorAll('.gn-cover-title').length === 2, null, { timeout: 15000 });
  log('  iPad shelf:', JSON.stringify(await pad.titles()));
  await pad.page.locator('.gn-cover-title', { hasText: /Fog$/ }).click();
  log('  iPad original keeps the iPad text:', await pad.box('ABOUT text').textContent());
  await pad.page.getByRole('button', { name: 'My Books' }).click();
  await pad.page.locator('.gn-cover-title', { hasText: 'copy' }).click();
  log('  iPad copy has the iMac text:', await pad.box('ABOUT text').textContent(), '| drawing:', await pad.stage.locator('.gn-portrait img').count(), 'layers');
  await pad.page.getByRole('button', { name: 'My Books' }).click();

  // 5. New Photos: taken on the iPad, used on the iMac
  const [ch2] = await Promise.all([pad.page.waitForEvent('filechooser'), pad.page.getByRole('button', { name: 'Add Photos' }).click()]);
  await ch2.setFiles([photo('a.jpg'), photo('b.jpg')]);
  await pad.page.waitForFunction(() => document.querySelectorAll('.gn-tray-item').length === 2);
  await pad.synced();
  await mac.poke();
  await mac.page.waitForFunction(() => document.querySelectorAll('.gn-tray-item img').length === 2, null, { timeout: 15000 });
  log('5 iPad added 2 photos; iMac tray shows:', await mac.page.locator('.gn-tray-item img').count());
  await mac.page.screenshot({ path: S + '/shot-tray.png' });
  await mac.page.locator('.gn-cover-title', { hasText: /Fog$/ }).click();
  await mac.page.getByRole('button', { name: 'New Card' }).click();
  await mac.page.getByRole('button', { name: 'Add your drawing' }).click();
  await mac.page.getByRole('dialog', { name: 'Pick a photo' }).waitFor();
  await mac.page.screenshot({ path: S + '/shot-picker.png' });
  await mac.page.getByRole('button', { name: 'New photo 1' }).click();
  await mac.page.waitForFunction(() => { const c = document.querySelectorAll('.gn-import-view canvas')[1]; return c && c.width > 100; });
  await mac.page.waitForTimeout(400);
  await mac.page.getByRole('button', { name: 'Looks Good!' }).click();
  await mac.stage.locator('.gn-portrait img').first().waitFor();
  await mac.synced();
  await mac.page.getByRole('button', { name: 'My Books' }).click();
  await pad.poke();
  await pad.page.waitForFunction(() => document.querySelectorAll('.gn-tray-item').length === 1, null, { timeout: 15000 });
  log('  used one on the iMac: iMac tray', await mac.page.locator('.gn-tray-item').count(), '| iPad tray', await pad.page.locator('.gn-tray-item').count());

  // 6. Deleting a book on one device removes it on the other
  await mac.page.locator('.gn-cover-wrap', { hasText: 'copy' }).getByRole('button', { name: /Delete/ }).click();
  await mac.page.waitForTimeout(2500);
  await mac.synced();
  await pad.poke();
  await pad.page.waitForFunction(() => document.querySelectorAll('.gn-cover-title').length === 1, null, { timeout: 15000 });
  log('6 iMac deleted the copy; iPad shelf:', JSON.stringify(await pad.titles()));

  // 7. A third, brand-new device gets everything
  const tv = await device('new', { width: 1440, height: 960 });
  await tv.page.goto(URL);
  await tv.page.locator('.gn-cover-title').first().waitFor({ timeout: 15000 });
  await tv.page.waitForFunction(() => document.querySelectorAll('.gn-tray-item img').length === 1, null, { timeout: 15000 });
  log('7 fresh device:', JSON.stringify(await tv.titles()), '| pages', await tv.page.locator('.gn-cover-meta').allTextContents(), '| tray', await tv.page.locator('.gn-tray-item').count());
  log('errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch((e) => { console.error('FAILED', String(e).slice(0, 1200)); process.exit(1); });
