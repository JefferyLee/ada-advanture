// Browser test: Draw & Color. A drawing started on a blank card (mouse, finger, Apple Pencil, a
// palm after the Pencil), fill then draw across it, the eraser, undo/redo, how it shows on the page
// and after a reload; rubbing out the pencil lines of an imported photo; drawing in a comic panel.
// Run:  npm run build && npm run preview      (in another terminal)
//       node tests/studio/draw.cjs
// Needs Playwright:  npm i -D playwright && npx playwright install chromium
// Screenshots go to the folder in SHOTS_DIR (default: the system temp folder).
const { chromium } = require('playwright');
const S = process.env.SHOTS_DIR || require('os').tmpdir();
const log = (...a) => console.log(...a);
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1, hasTouch: true });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('dialog', (d) => d.accept());

  await page.goto((process.env.STUDIO_URL || 'http://localhost:4173/studio/'));
  await page.getByRole('button', { name: 'New Episode' }).click();
  await page.waitForSelector('.gn-page');

  // 1. Blank sheet, from the empty space on the card (the side panel has Draw It too)
  log('1 side panel offers Draw It:', await page.locator('.gn-panel').getByRole('button', { name: 'Draw It', exact: true }).count());
  await page.getByRole('button', { name: 'Draw it here' }).click();
  const studio = page.locator('.gn-color');
  const canvas = page.locator('.gn-color-canvas');
  await page.waitForFunction(() => document.querySelector('.gn-color-canvas')?.style.visibility === 'visible');
  const size = await canvas.evaluate((c) => [c.width, c.height]);
  log('  Draw it here: blank sheet', size.join('x'), '| pen chosen:', await studio.getByRole('button', { name: 'Pen' }).getAttribute('aria-pressed'));

  const cb = await canvas.boundingBox();
  const at = (fx, fy) => [cb.x + cb.width * fx, cb.y + cb.height * fy];
  const px = (fx, fy) => canvas.evaluate((c, [fx, fy]) => Array.from(c.getContext('2d').getImageData(Math.round(fx * c.width), Math.round(fy * c.height), 1, 1).data).join(','), [fx, fy]);
  const mouse = async (pts) => {
    await page.mouse.move(...at(...pts[0])); await page.mouse.down();
    for (const p of pts.slice(1)) await page.mouse.move(...at(...p), { steps: 8 });
    await page.mouse.up();
  };
  const touch = async (pts) => {
    const tp = (p) => { const [x, y] = at(...p); return [{ x, y }]; };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(pts[0]) });
    for (let k = 1; k < pts.length; k++) {
      for (let s = 1; s <= 8; s++) {
        const p = [pts[k - 1][0] + (pts[k][0] - pts[k - 1][0]) * s / 8, pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * s / 8];
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(p) });
      }
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  const pencil = async (pts) => {
    const ev = (type, p, extra = {}) => { const [x, y] = at(...p); return cdp.send('Input.dispatchMouseEvent', { type, x, y, pointerType: 'pen', button: 'left', ...extra }); };
    await ev('mousePressed', pts[0], { buttons: 1, clickCount: 1 });
    for (let k = 1; k < pts.length; k++) for (let s = 1; s <= 8; s++) await ev('mouseMoved', [pts[k - 1][0] + (pts[k][0] - pts[k - 1][0]) * s / 8, pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * s / 8], { buttons: 1 });
    await ev('mouseReleased', pts[pts.length - 1], { buttons: 0, clickCount: 1 });
  };

  // 2. Mouse: a square, then fill it, then a blue line across it
  await mouse([[0.2, 0.2], [0.8, 0.2], [0.8, 0.5], [0.2, 0.5], [0.2, 0.2]]);
  log('2 mouse square: on the line', await px(0.5, 0.2), '| inside', await px(0.5, 0.35));
  await studio.getByRole('button', { name: 'Fill' }).click();
  await studio.getByRole('button', { name: 'Orange' }).click();
  await page.mouse.click(...at(0.5, 0.35));
  log('  filled inside:', await px(0.5, 0.35), '| outside stays clear:', await px(0.5, 0.7));
  await studio.getByRole('button', { name: 'Pen' }).click();
  await studio.getByRole('button', { name: 'Blue' }).click();
  await mouse([[0.5, 0.1], [0.5, 0.6]]);
  log('  blue line across the color: on it', await px(0.5, 0.35), '| color stays both sides', await px(0.35, 0.35), await px(0.65, 0.35));

  // 3. Eraser across the square's bottom edge
  await studio.getByRole('button', { name: 'Eraser' }).click();
  await studio.getByRole('button', { name: 'Thick' }).click();
  await mouse([[0.3, 0.5], [0.4, 0.5]]);
  const rubbed = await px(0.35, 0.5);
  log('3 eraser: edge at 0.35 rubbed out (no black):', rubbed !== '27,27,47,255', rubbed, '| edge further on kept:', await px(0.7, 0.5));
  await studio.getByRole('button', { name: 'Undo' }).click();
  log('  undo brings the edge back:', await px(0.35, 0.5));
  await studio.getByRole('button', { name: 'Redo' }).click();
  log('  redo rubs it out again:', await px(0.35, 0.5) === rubbed);

  // 4. Finger, then Apple Pencil, then a palm
  await studio.getByRole('button', { name: 'Pen' }).click();
  await studio.getByRole('button', { name: 'Green' }).click();
  await touch([[0.15, 0.75], [0.85, 0.75]]);
  log('4 finger draws:', await px(0.5, 0.75));
  await studio.getByRole('button', { name: 'Purple' }).click();
  await pencil([[0.15, 0.85], [0.85, 0.85]]);
  log('  Apple Pencil draws:', await px(0.5, 0.85));
  await touch([[0.15, 0.93], [0.85, 0.93]]);
  log('  a palm after the Pencil draws nothing:', await px(0.5, 0.93));
  await page.screenshot({ path: S + '/shot-draw-studio.png' });

  // 5. On the page, and after a reload
  await studio.getByRole('button', { name: 'Done' }).click();
  await page.waitForSelector('.gn-color', { state: 'detached' });
  const shown = () => page.locator('.gn-stage .gn-portrait').evaluate((el) => ({
    strokes: [...el.querySelectorAll('svg path')].filter((p) => !p.closest('mask')).length,
    rubs: el.querySelectorAll('mask path').length,
    color: el.querySelectorAll('img').length,
  }));
  log('5 on the card: strokes', JSON.stringify(await shown()), '(want 4 strokes: square, blue, finger, Pencil; 1 rub; 1 color layer)');
  await page.locator('.gn-stage .gn-page').first().screenshot({ path: S + '/shot-draw-card.png' });
  await page.waitForFunction(() => /Saved/.test(document.querySelector('.gn-saved')?.textContent || ''));
  await page.reload();
  await page.locator('.gn-cover-purple, .gn-cover-orange, .gn-cover-yellow').first().click();
  await page.waitForSelector('.gn-stage .gn-portrait svg');
  log('  after reload:', JSON.stringify(await shown()));

  // 6. Reopen: what was drawn is still there to change
  await page.getByRole('button', { name: 'Draw & Color' }).click();
  await page.waitForFunction(() => document.querySelector('.gn-color-canvas')?.style.visibility === 'visible');
  log('6 reopened: square and fill still there:', await px(0.8, 0.35), await px(0.35, 0.35));
  await studio.getByRole('button', { name: 'Cancel' }).click();

  // 7. An imported photo: rub out its pencil lines
  await page.getByRole('button', { name: 'Take It Off' }).click();
  const dataUrl = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 1000; c.height = 700; const x = c.getContext('2d');
    x.fillStyle = '#5a5a5a'; x.fillRect(0, 0, 1000, 700); x.fillStyle = '#ece8dc'; x.fillRect(150, 100, 700, 500);
    x.strokeStyle = '#3a3a44'; x.lineWidth = 6; x.lineCap = 'round';
    x.beginPath(); x.arc(500, 260, 90, 0, 7); x.stroke();
    x.beginPath(); x.moveTo(500, 350); x.lineTo(500, 520); x.stroke();
    return c.toDataURL('image/jpeg', 0.92);
  });
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Add your drawing' }).click()]);
  await chooser.setFiles({ name: 'photo.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(dataUrl.split(',')[1], 'base64') });
  await page.waitForFunction(() => { const c = document.querySelectorAll('.gn-import-view canvas')[1]; return c && c.width > 100; });
  await page.getByRole('button', { name: 'Neat Lines' }).click(); // pencil lines
  await page.getByRole('button', { name: 'Read My Words' }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Looks Good!' }).click();
  await page.waitForSelector('.gn-stage .gn-portrait img');
  await page.getByRole('button', { name: 'Draw & Color' }).click();
  await page.waitForFunction(() => document.querySelector('.gn-color-canvas')?.style.visibility === 'visible');
  const ink = await canvas.evaluate((c) => {
    // the darkest row of the body line: where it is, as fractions
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0; let sx = 0; let sy = 0;
    for (let y = Math.round(c.height * 0.75); y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 200) { n++; sx += x; sy += y; }
    return n ? [sx / n / c.width, sy / n / c.height, n] : null;
  });
  const cb2 = await canvas.boundingBox();
  Object.assign(cb, cb2);
  log('7 imported drawing open; pencil line found at', ink.slice(0, 2).map((v) => v.toFixed(2)).join(','), 'ink px', ink[2]);
  await studio.getByRole('button', { name: 'Eraser' }).click();
  await studio.getByRole('button', { name: 'Thick' }).click();
  await mouse([[ink[0] - 0.15, ink[1]], [ink[0] + 0.15, ink[1]]]);
  log('  pencil line rubbed out:', await px(ink[0], ink[1]));
  await studio.getByRole('button', { name: 'Done' }).click();
  await page.waitForSelector('.gn-color', { state: 'detached' });
  log('  on the page: line art inside a rub-out mask:', await page.locator('.gn-stage .gn-portrait').evaluate((el) => Boolean(el.querySelector('g[mask] image'))));
  log('  switch to neat lines keeps the rub-out:', await page.getByRole('button', { name: 'Neat Lines' }).click().then(() => page.waitForTimeout(500)).then(() => page.locator('.gn-stage .gn-portrait').evaluate((el) => Boolean(el.querySelector('g[mask] image')))));
  await page.locator('.gn-stage .gn-page').first().screenshot({ path: S + '/shot-draw-erased.png' });

  // 8. A comic panel: Draw on an empty one gives a sheet its shape
  await page.getByRole('button', { name: 'New Comic' }).click();
  const cell = page.locator('.gn-stage .gn-cell').first();
  const cellBox = await cell.boundingBox();
  await cell.getByRole('button', { name: 'Draw' }).click();
  await page.waitForFunction(() => document.querySelector('.gn-color-canvas')?.style.visibility === 'visible');
  const sheet = await canvas.evaluate((c) => [c.width, c.height]);
  log('8 panel Draw: sheet', sheet.join('x'), '| same shape as the panel:', Math.abs(sheet[0] / sheet[1] - cellBox.width / cellBox.height) < 0.03);
  Object.assign(cb, await canvas.boundingBox());
  await pencil([[0.2, 0.5], [0.5, 0.2], [0.8, 0.5]]);
  await studio.getByRole('button', { name: 'Done' }).click();
  await page.waitForSelector('.gn-color', { state: 'detached' });
  log('  drawn in the panel:', await cell.locator('.gn-drawing svg path').count(), 'stroke');
  await page.locator('.gn-stage .gn-page').first().screenshot({ path: S + '/shot-draw-panel.png' });

  log('errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
