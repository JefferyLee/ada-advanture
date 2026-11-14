// Browser test: comic page (bubbles, drag, pen, eraser, layouts), Draw & Color, helper adding a
// bubble, reload, print layout.
// Run:  npm run build && npm run preview      (in another terminal)
//       node tests/studio/comic.cjs
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
  page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push('console: ' + m.text()); });
  page.on('dialog', (d) => d.accept());
  const stage = page.locator('.gn-stage');
  const strokes = () => stage.locator('.gn-ink path').evaluateAll((ps) => ps.filter((p) => (p.getAttribute('d') || '').length > 0).length);

  await page.goto((process.env.STUDIO_URL || 'http://localhost:4173/studio/'));
  await page.getByRole('button', { name: 'New Episode' }).click();
  await page.getByRole('button', { name: 'New Comic' }).click();
  await stage.locator('.gn-comic').waitFor();
  log('1 comic page, panels:', await stage.locator('.gn-cell').count());

  await page.getByRole('button', { name: 'Speech', exact: true }).click();
  const bubble = stage.locator('.gn-item-speech');
  log('2 bubble focused:', await page.evaluate(() => document.activeElement?.getAttribute('aria-label')));
  await page.keyboard.type('Take that, Fog!');
  const box0 = await bubble.boundingBox();
  const mv = await stage.getByRole('button', { name: 'Move', exact: true }).boundingBox();
  await page.mouse.move(mv.x + mv.width / 2, mv.y + mv.height / 2); await page.mouse.down();
  await page.mouse.move(mv.x + 160, mv.y + 90, { steps: 5 }); await page.mouse.up();
  const box1 = await bubble.boundingBox();
  log('3 moved by', Math.round(box1.x - box0.x), Math.round(box1.y - box0.y), '(dragged ~143, ~73)');
  const sz = await stage.getByRole('button', { name: 'Make wider or narrower' }).boundingBox();
  await page.mouse.move(sz.x + sz.width / 2, sz.y + sz.height / 2); await page.mouse.down();
  await page.mouse.move(sz.x + 120, sz.y + sz.height / 2, { steps: 4 }); await page.mouse.up();
  const box2 = await bubble.boundingBox();
  log('  width', Math.round(box1.width), '->', Math.round(box2.width), '| text:', await bubble.locator('.gn-text').textContent());
  await page.locator('.gn-grid4 .gn-tile').nth(2).click();
  await page.getByRole('button', { name: 'Blue', exact: true }).click();
  log('4 styled:', await bubble.locator('.gn-text').evaluate((e) => getComputedStyle(e).fontSize + ' ' + getComputedStyle(e).color));

  await page.getByRole('button', { name: 'Sound Word', exact: true }).click();
  await page.keyboard.type('ZAP!');
  log('5 items:', await stage.locator('.gn-item').count(), '| sound:', await stage.locator('.gn-item-sound .gn-text').textContent());

  // Pen
  await page.getByRole('button', { name: 'Pen', exact: true }).click();
  const st = await stage.locator('.gn-comic-inner').boundingBox();
  const draw = async (pts) => { await page.mouse.move(st.x + pts[0][0], st.y + pts[0][1]); await page.mouse.down(); for (const p of pts.slice(1)) await page.mouse.move(st.x + p[0], st.y + p[1], { steps: 6 }); await page.mouse.up(); };
  await draw([[300, 420], [380, 460], [460, 420], [540, 470]]);
  await page.getByRole('button', { name: 'Thick pen' }).click();
  await page.getByRole('button', { name: 'Red', exact: true }).click();
  await draw([[320, 520], [520, 520]]);
  log('6 strokes after drawing two:', await strokes(), '| second:', await stage.locator('.gn-ink path').nth(1).evaluate((p) => p.getAttribute('stroke') + ' w' + p.getAttribute('stroke-width')));
  log('  bubble untouched while drawing over it:', await bubble.locator('.gn-text').textContent());
  await page.getByRole('button', { name: 'Undo' }).click();
  log('  after undo:', await strokes());
  await page.getByRole('button', { name: 'Redo' }).click();
  await page.getByRole('button', { name: 'Eraser', exact: true }).click();
  await draw([[420, 400], [420, 560]]);
  log('7 after one eraser rub across both:', await strokes());
  await page.getByRole('button', { name: 'Undo' }).click();
  log('  one undo brings back:', await strokes());

  // Layouts
  await page.getByRole('button', { name: 'Four equal panels' }).click();
  const four = await stage.locator('.gn-cell').count();
  await page.getByRole('button', { name: 'Three small panels, one wide, one small' }).click();
  log('8 layout four:', four, 'panels, back to wide:', await stage.locator('.gn-cell').count());

  // Photo into the wide panel, then color it
  await page.locator('.gn-panel').getByRole('button', { name: 'Move', exact: true }).click();
  const dataUrl = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 1000; c.height = 700; const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 1000, 0); g.addColorStop(0, '#a39d8c'); g.addColorStop(1, '#ece6d4'); x.fillStyle = g; x.fillRect(0, 0, 1000, 700);
    x.strokeStyle = '#3a3a45'; x.lineWidth = 6; x.lineCap = 'round';
    x.beginPath(); x.arc(380, 350, 180, 0.06, Math.PI * 2); x.stroke();          // body, with a small gap in the line
    x.beginPath(); x.rect(650, 250, 180, 200); x.stroke();                                // a box next to it
    return c.toDataURL('image/jpeg', 0.92);
  });
  await stage.locator('.gn-cell').nth(3).click({ position: { x: 30, y: 30 } });
  await page.locator('.gn-panel').getByRole('button', { name: 'Add Photo' }).click();
  await page.setInputFiles('input[type=file]', { name: 'p.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(dataUrl.split(',')[1], 'base64') });
  await page.waitForFunction(() => { const c = document.querySelectorAll('.gn-import-view canvas')[1]; return c && c.width > 300; });
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Looks Good!' }).click();
  await stage.locator('.gn-cell .gn-drawing img').first().waitFor();
  log('9 photo in panel 4:', await stage.locator('.gn-cell').nth(3).locator('img').count(), 'image');

  await page.locator('.gn-panel').getByRole('button', { name: 'Draw & Color' }).click();
  const canvas = page.locator('.gn-color-canvas');
  await page.waitForFunction(() => { const c = document.querySelector('.gn-color-canvas'); return c && c.style.visibility === 'visible' && c.width > 100; });
  const cb = await canvas.boundingBox();
  const px = (fx, fy) => canvas.evaluate((c, [fx, fy]) => Array.from(c.getContext('2d').getImageData(Math.round(fx * c.width), Math.round(fy * c.height), 1, 1).data).join(','), [fx, fy]);
  // circle centre is left of middle; square is right
  await page.mouse.click(cb.x + cb.width * 0.28, cb.y + cb.height * 0.5);
  log('10 tap in circle (orange):', await px(0.28, 0.5), '| outside stays clear:', await px(0.02, 0.03), '| square stays clear:', await px(0.82, 0.5));
  await page.getByRole('button', { name: 'Blue', exact: true }).click();
  await page.mouse.click(cb.x + cb.width * 0.82, cb.y + cb.height * 0.5);
  log('   tap in square (blue):', await px(0.82, 0.5));
  await page.getByRole('button', { name: 'Small', exact: true }).click();
  await page.waitForTimeout(200);
  log('   with gaps set to Small, does the circle leak to outside?', (await px(0.02, 0.03)) !== '0,0,0,0');
  await page.getByRole('button', { name: 'Medium', exact: true }).click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: S + '/shot-color.png' });
  await page.getByRole('button', { name: 'Un-color' }).click();
  await page.mouse.click(cb.x + cb.width * 0.82, cb.y + cb.height * 0.5);
  log('   un-color square:', await px(0.82, 0.5));
  await page.locator('.gn-color').getByRole('button', { name: 'Undo' }).click();
  log('   undo brings blue back:', await px(0.82, 0.5));
  await page.getByRole('button', { name: 'Done' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.gn-stage .gn-cell .gn-drawing img').length === 2);
  const sizes = await stage.locator('.gn-cell .gn-drawing img').evaluateAll((imgs) => imgs.map((i) => i.getBoundingClientRect()).map((r) => [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)].join(',')));
  log('11 color layer under line art, same box:', sizes[0] === sizes[1], sizes[0]);

  // Helper adds a bubble and edits one (mocked answer)
  let sent = null;
  await page.route('**/api/studio/helper', async (route) => {
    sent = route.request().postDataJSON();
    const first = sent.page.items[0].target;
    await route.fulfill({ json: { reply: 'I added a sound word and fixed your bubble.', actions: [
      { type: 'add_bubble', target: 'page', text: 'KA-BOOM!', font: null, size: null, color: null, box_style: null, bubble_kind: 'sound' },
      { type: 'set_text', target: first, text: 'Take that, Fog! Ha!', font: null, size: null, color: null, box_style: null, bubble_kind: null },
    ] } });
  });
  await page.locator('#gn-ask').fill('add a sound word');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Keep It' }).waitFor();
  log('12 helper saw:', JSON.stringify({ kind: sent.page.kind, panels: sent.page.panels, items: sent.page.items.map((i) => i.kind + ':' + i.text) }));
  log('   after helper:', await stage.locator('.gn-item .gn-text').allTextContents());
  await page.getByRole('button', { name: 'Keep It' }).click();
  await page.waitForTimeout(100);
  await page.screenshot({ path: S + '/shot-comic.png' });

  // Reload
  await page.waitForFunction(() => /Saved/.test(document.querySelector('.gn-saved')?.textContent || ''));
  await page.reload();
  await page.locator('.gn-cover-purple, .gn-cover-orange, .gn-cover-yellow').first().click();
  await page.locator('.gn-thumb').nth(1).click();
  await stage.locator('.gn-cell .gn-drawing img').nth(1).waitFor();
  log('13 after reload: strokes', await strokes(), '| items', await stage.locator('.gn-item').count(), '| drawing layers', await stage.locator('.gn-cell .gn-drawing img').count(), '| thumb:', await page.locator('.gn-thumb').nth(1).textContent());
  await page.emulateMedia({ media: 'print' });
  log('14 print:', JSON.stringify(await page.evaluate(() => { const p = document.querySelector('.gn-print .gn-page'); const r = p.getBoundingClientRect(); return { size: Math.round(r.width) + 'x' + Math.round(r.height), strokes: p.querySelectorAll('.gn-ink path').length - 1, items: p.querySelectorAll('.gn-item').length, handles: p.querySelectorAll('.gn-handle').length }; })));
  await page.emulateMedia({ media: 'screen' });
  log('errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
