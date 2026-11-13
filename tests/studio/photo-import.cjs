// Browser test: importing a photo taken at an angle (finding the paper, dragging corners,
// Whole Photo, Find My Paper, Turn It).
// Run:  npm run build && npm run preview      (in another terminal)
//       node tests/studio/photo-import.cjs
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
  await page.goto((process.env.STUDIO_URL || 'http://localhost:4173/studio/'));
  await page.getByRole('button', { name: 'New Episode' }).click();

  // A photo taken at an angle: wooden desk, a sheet of paper lying askew, a drawing on it, a shadow across one side.
  const truth = [[420, 330], [2050, 250], [2230, 1520], [300, 1400]];
  const dataUrl = await page.evaluate((q) => {
    const c = document.createElement('canvas'); c.width = 2600; c.height = 1800; const x = c.getContext('2d');
    x.fillStyle = '#6d5238'; x.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < 60; i++) { x.fillStyle = `rgba(0,0,0,${0.03 + Math.random() * 0.05})`; x.fillRect(0, Math.random() * c.height, c.width, 6 + Math.random() * 20); }
    x.beginPath(); x.moveTo(...q[0]); q.slice(1).forEach((p) => x.lineTo(...p)); x.closePath(); x.fillStyle = '#efeadc'; x.fill();
    const g = x.createLinearGradient(0, 0, c.width, 0); g.addColorStop(0, 'rgba(0,0,0,0.28)'); g.addColorStop(0.6, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, c.width, c.height);
    x.strokeStyle = '#3d3d48'; x.lineWidth = 9; x.lineCap = 'round'; x.setTransform(1, -0.05, -0.07, 1, 0, 0);
    x.beginPath(); x.arc(1330, 720, 230, 0, 7); x.stroke();
    x.beginPath(); x.ellipse(1340, 1160, 190, 250, 0, 0, 7); x.stroke();
    x.beginPath(); x.moveTo(820, 560); x.lineTo(1000, 620); x.moveTo(1850, 520); x.lineTo(1660, 600); x.stroke();
    x.font = '120px sans-serif'; x.fillStyle = '#3d3d48'; x.fillText('WORMY', 720, 520);
    return c.toDataURL('image/jpeg', 0.9);
  }, truth);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Add your drawing' }).click()]);
  await chooser.setFiles({ name: 'angled.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(dataUrl.split(',')[1], 'base64') });
  await page.waitForSelector('.gn-corner');
  const ready = () => page.waitForFunction(() => { const c = document.querySelectorAll('.gn-import-view canvas')[1]; return c && c.width > 100; });
  await ready(); await page.waitForTimeout(400);
  const cornersNow = () => page.locator('.gn-corner').evaluateAll((bs) => bs.map((b) => [parseFloat(b.style.left) / 100, parseFloat(b.style.top) / 100]));
  const cleanSize = () => page.locator('.gn-import-view canvas').nth(1).evaluate((c) => [c.width, c.height]);
  const note = () => page.locator('.gn-import-pane .gn-note').first().textContent();
  const c0 = await cornersNow();
  log('1 note:', await note());
  log('  corners found (px in the 2600x1800 photo):', c0.map(([x, y]) => `${Math.round(x * 2600)},${Math.round(y * 1800)}`).join('  '));
  log('  truth                                    :', truth.map((p) => p.join(',')).join('  '));
  log('  error px:', c0.map(([x, y], i) => Math.round(Math.hypot(x * 2600 - truth[i][0], y * 1800 - truth[i][1]))).join(', '), '(about 40 of it is the deliberate inset)');
  const s0 = await cleanSize();
  log('2 cleaned picture:', s0.join('x'), '| aspect', (s0[0] / s0[1]).toFixed(2), '(the sheet is about 1.45 wide)');
  // The desk must not show up as ink: look at the cleaned picture's four corner patches
  const rim = await page.locator('.gn-import-view canvas').nth(1).evaluate((c) => { const x = c.getContext('2d'); const a = (px, py) => { const d = x.getImageData(px, py, 30, 30).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 100) n++; return n; }; return [a(0, 0), a(c.width - 30, 0), a(c.width - 30, c.height - 30), a(0, c.height - 30)]; });
  log('  ink pixels in each 30x30 corner patch (0 = no desk or shadow leaked in):', rim.join(','));
  await page.screenshot({ path: S + '/shot-corners.png' });

  // Drag the top-left dot down and to the right
  const tl = await page.getByRole('button', { name: 'Top left corner' }).boundingBox();
  await page.mouse.move(tl.x + tl.width / 2, tl.y + tl.height / 2); await page.mouse.down();
  await page.mouse.move(tl.x + tl.width / 2 + 90, tl.y + tl.height / 2 + 60, { steps: 6 }); await page.mouse.up();
  await page.waitForTimeout(450);
  const c1 = await cornersNow(); const s1 = await cleanSize();
  log('3 after dragging the top-left dot: it moved by', ((c1[0][0] - c0[0][0]) * 100).toFixed(1) + '%,', ((c1[0][1] - c0[0][1]) * 100).toFixed(1) + '%', '| others unchanged:', JSON.stringify(c1.slice(1)) === JSON.stringify(c0.slice(1)), '| cleaned picture now', s1.join('x'));
  await page.getByRole('button', { name: 'Bottom right corner' }).focus();
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft');
  log('  arrow keys nudge a dot:', (((await cornersNow())[2][0] - c1[2][0]) * 100).toFixed(1) + '%');

  await page.getByRole('button', { name: 'Whole Photo' }).click(); await page.waitForTimeout(450);
  log('4 Whole Photo: corners', JSON.stringify(await cornersNow()), '| cleaned', (await cleanSize()).join('x'), '| note:', await note());
  await page.getByRole('button', { name: 'Find My Paper' }).click(); await page.waitForTimeout(450);
  log('5 Find My Paper: back to found corners:', JSON.stringify(await cornersNow()) === JSON.stringify(c0), '| cleaned', (await cleanSize()).join('x'));
  await page.getByRole('button', { name: 'Turn It' }).click(); await page.waitForTimeout(600);
  const s2 = await cleanSize();
  log('6 Turn It: cleaned', s2.join('x'), '(tall now) | note:', await note());
  for (let i = 0; i < 3; i++) { await page.getByRole('button', { name: 'Turn It' }).click(); await page.waitForTimeout(350); }
  await page.waitForTimeout(400);

  // Degenerate corners: put two dots on top of the others
  await page.getByRole('button', { name: 'Looks Good!' }).click();
  await page.waitForSelector('.gn-stage .gn-portrait img');
  const nat = await page.locator('.gn-stage .gn-portrait img').first().evaluate((e) => new Promise((r) => { const done = () => r([e.naturalWidth, e.naturalHeight]); e.complete ? done() : (e.onload = done); }));
  log('7 on the card: drawing', nat.join('x'), '(trimmed to the lines)');
  await page.screenshot({ path: S + '/shot-corners-card.png' });

  // On the page: Neat Lines and Just My Character switch between the versions made at import.
  const shown = () => page.locator('.gn-stage .gn-portrait img').last().evaluate((e) => new Promise((r) => {
    const done = () => r({ w: e.naturalWidth, h: e.naturalHeight, src: e.src });
    e.complete && e.naturalWidth ? done() : (e.onload = done);
  }));
  const side = page.locator('.gn-panel');
  const flip = async (name) => {
    const b = side.getByRole('button', { name });
    const was = await b.getAttribute('aria-pressed');
    await b.click();
    await page.waitForFunction(([n, w]) => [...document.querySelectorAll('.gn-panel button')]
      .some((e) => e.textContent.includes(n) && e.getAttribute('aria-pressed') !== w), [name, was]);
    await page.waitForTimeout(300);
    return shown();
  };
  const start = await shown();
  const pencil = await flip('Neat Lines');
  const neatAgain = await flip('Neat Lines');
  log('8 Neat Lines off: other lines', pencil.src !== start.src, '| same size', pencil.w === start.w && pencil.h === start.h,
    '| on again: back', neatAgain.src === start.src);
  const everything = await flip('Just My Character');
  const figureAgain = await flip('Just My Character');
  log('  Just My Character off: drawing', `${start.w}x${start.h} -> ${everything.w}x${everything.h}`,
    '(bigger, the arms are back)', everything.w * everything.h > start.w * start.h, '| on again: back', figureAgain.src === start.src);

  // Colored, then switched: the color layer is worked out again for the other version.
  await page.getByRole('button', { name: 'Color It' }).click();
  const art = page.locator('.gn-color canvas').first();
  await art.waitFor();
  await page.waitForTimeout(500);
  const box = await art.boundingBox();
  await art.click({ position: { x: box.width * 0.5, y: box.height * 0.08 } });
  await page.getByRole('button', { name: 'Done' }).click();
  await page.waitForSelector('.gn-color', { state: 'detached' });
  const layers = () => page.locator('.gn-stage .gn-portrait img').count();
  const before = await layers();
  await flip('Neat Lines');
  const afterLines = await layers();
  await flip('Just My Character');
  log('9 colored then switched: layers', before, '-> lines', afterLines, '-> everything', await layers());
  log('errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
