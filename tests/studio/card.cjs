// Browser test: bookshelf and character card (type, style, undo, photo import, helper with a
// stand-in answer, reload, print layout, iPad size).
// Run:  npm run build && npm run preview      (in another terminal)
//       node tests/studio/card.cjs
// Needs Playwright:  npm i -D playwright && npx playwright install chromium
// Screenshots go to the folder in SHOTS_DIR (default: the system temp folder).
const { chromium } = require('playwright');
const S = process.env.SHOTS_DIR || require('os').tmpdir();
const log = (...a) => console.log(...a);
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('dialog', (d) => d.accept());

  await page.goto((process.env.STUDIO_URL || 'http://localhost:4173/studio/'));
  await page.getByRole('button', { name: 'New Episode' }).click();
  await page.waitForSelector('.gn-page');
  log('1 editor open, panel hint:', await page.locator('.gn-panel-hint').count());

  // Type the name and a box
  const name = page.getByRole('textbox', { name: 'Character name' }).first();
  await name.click(); await page.keyboard.type('WORMY');
  const body = page.getByRole('textbox', { name: 'POWERS text' }).first();
  await body.click(); await page.keyboard.type('Can dig realy fast'); await page.keyboard.press('Enter'); await page.keyboard.type('Super strech');
  log('2 body text:', JSON.stringify(await body.evaluate((e) => e.textContent)));
  log('  panel title:', await page.locator('.gn-panel-title').textContent());

  // Style it
  await page.locator('.gn-grid2 .gn-tile').nth(2).click();
  await page.locator('.gn-grid4 .gn-tile').nth(2).click();
  await page.getByRole('button', { name: 'Green' }).click();
  await page.getByRole('button', { name: 'Banner' }).click();
  log('3 style:', await body.evaluate((e) => { const s = getComputedStyle(e); return [s.fontFamily, s.fontSize, s.color].join(' | '); }),
    '| box class:', await page.locator('.gn-box').first().getAttribute('class'));
  log('  caret kept focus in body:', await page.evaluate(() => document.activeElement?.getAttribute('aria-label')));

  // Undo x4 puts style back, redo x4 restores
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Undo' }).click();
  log('4 after 4 undo:', await page.locator('.gn-box').first().getAttribute('class'), '| text kept:', JSON.stringify(await body.evaluate((e) => e.textContent)));
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Redo' }).click();
  log('  after 4 redo:', await page.locator('.gn-box').first().getAttribute('class'));

  // Episode title
  await page.getByLabel('Episode 1:').fill('Wormy Begins');

  // Photo import with a synthetic "photo": gray paper, uneven light, a drawing, specks
  const dataUrl = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 1000; c.height = 700; const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 1000, 0); g.addColorStop(0, '#8d8778'); g.addColorStop(1, '#e9e3d0'); x.fillStyle = g; x.fillRect(0, 0, 1000, 700);
    x.strokeStyle = '#4a4a55'; x.lineWidth = 5; x.lineCap = 'round';
    x.beginPath(); x.arc(500, 250, 110, 0, 7); x.stroke();
    x.beginPath(); x.ellipse(500, 480, 90, 130, 0, 0, 7); x.stroke();
    x.beginPath(); x.arc(460, 230, 12, 0, 7); x.arc(540, 230, 12, 0, 7); x.fill();
    x.fillStyle = '#55555f'; for (let i = 0; i < 30; i++) x.fillRect(40 + Math.random() * 200, 40 + Math.random() * 600, 2, 2);
    return c.toDataURL('image/jpeg', 0.9);
  });
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Add your drawing' }).click()]);
  await chooser.setFiles({ name: 'photo.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(dataUrl.split(',')[1], 'base64') });
  await page.waitForSelector('.gn-modal');
  await page.waitForFunction(() => { const c = document.querySelectorAll('.gn-import-view canvas')[1]; return c && c.width > 300; });
  await page.waitForTimeout(300);
  await page.screenshot({ path: S + '/shot-import.png' });
  await page.getByRole('button', { name: 'Looks Good!' }).click();
  await page.waitForSelector('.gn-stage .gn-portrait img');
  log('  drawing box on card:', JSON.stringify(await page.locator('.gn-stage .gn-portrait img').first().boundingBox().then((b) => [Math.round(b.width), Math.round(b.height)])));
  const img = await page.locator('.gn-stage .gn-portrait img').first().evaluate((e) => new Promise((r) => { const done = () => r([e.naturalWidth, e.naturalHeight]); e.complete ? done() : (e.onload = done); }));
  log('5 imported drawing natural size (trimmed from 1000x700):', img.join('x'));

  // Second page
  await page.getByRole('button', { name: 'New Card' }).click();
  log('6 pages:', await page.locator('.gn-thumb').count() - 2, '| new page name empty:', JSON.stringify(await page.getByRole('textbox', { name: 'Character name' }).first().textContent()));
  await page.locator('.gn-thumb').first().click();

  // Helper: not configured (preview server has no API)
  await body.click();
  await page.getByRole('button', { name: 'Fix my spelling' }).click();
  await page.waitForFunction(() => /switched on|went wrong/.test(document.querySelector('.gn-bubble-helper')?.textContent || ''));
  log('7 helper off:', await page.locator('.gn-bubble-helper').textContent());
  await page.getByRole('button', { name: 'OK', exact: true }).click();

  // Helper: mocked answer with actions
  let sent = null;
  await page.route('**/api/studio/helper', async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({ json: { reply: 'I fixed two words: really and stretch.', actions: [
      { type: 'set_text', target: 'box1.body', text: 'Can dig really fast\nSuper stretch', font: null, size: null, color: null, box_style: null },
      { type: 'set_style', target: 'name', text: null, font: null, size: 'xl', color: 'blue', box_style: null },
      { type: 'set_text', target: 'nope.body', text: 'x', font: null, size: null, color: null, box_style: null },
    ] } });
  });
  await body.click();
  await page.locator('#gn-ask').fill('fix my spelling please');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.getByRole('button', { name: 'Keep It' }).waitFor();
  log('8 sent:', JSON.stringify({ message: sent.message, selected: sent.selected, items: sent.page.items.length, firstItem: sent.page.items[0], history: sent.history.length }));
  log('  after helper:', JSON.stringify(await body.evaluate((e) => e.textContent)), '| name color:', await name.evaluate((e) => getComputedStyle(e).color));
  await page.screenshot({ path: S + '/shot-editor.png' });
  await page.getByRole('button', { name: 'Put It Back' }).click();
  log('  after Put It Back:', JSON.stringify(await body.evaluate((e) => e.textContent)), '| name color:', await name.evaluate((e) => getComputedStyle(e).color));
  await page.getByRole('button', { name: 'Redo' }).click();

  // Persistence
  await page.waitForFunction(() => /Saved/.test(document.querySelector('.gn-saved')?.textContent || ''));
  await page.reload();
  await page.waitForSelector('.gn-cover-title');
  log('9 after reload, shelf:', await page.locator('.gn-cover-title').allTextContents(), await page.locator('.gn-cover-meta').allTextContents());
  await page.screenshot({ path: S + '/shot-shelf.png' });
  await page.locator('.gn-cover-purple, .gn-cover-orange, .gn-cover-yellow').first().click();
  await page.waitForSelector('.gn-stage .gn-portrait img');
  log('  reopened:', await page.getByRole('textbox', { name: 'Character name' }).first().textContent(), '|', JSON.stringify(await page.getByRole('textbox', { name: 'POWERS text' }).first().textContent()), '| drawing shown:', await page.locator('.gn-stage .gn-portrait img').count());

  // Print layout
  await page.emulateMedia({ media: 'print' });
  const pr = await page.evaluate(() => { const p = document.querySelector('.gn-print .gn-page').getBoundingClientRect(); const vis = [...document.querySelectorAll('.gn-app > *')].filter((e) => getComputedStyle(e).display !== 'none').map((e) => e.className); return { w: Math.round(p.width), h: Math.round(p.height), vis }; });
  log('10 print: page', pr.w + 'x' + pr.h, '(A4 landscape is 1123x794) visible:', pr.vis);
  await page.pdf({ path: S + '/print.pdf', preferCSSPageSize: true, printBackground: true });
  await page.emulateMedia({ media: 'screen' });

  // iPad-sized window
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.waitForTimeout(200);
  const fit = await page.evaluate(() => { const h = document.querySelector('.gn-page-holder').getBoundingClientRect(); const s = document.querySelector('.gn-stage').getBoundingClientRect(); return { page: [Math.round(h.width), Math.round(h.height)], stage: [Math.round(s.width), Math.round(s.height)], scrollW: document.documentElement.scrollWidth }; });
  log('11 iPad 1180x820:', JSON.stringify(fit));
  await page.screenshot({ path: S + '/shot-ipad.png' });

  log('errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
