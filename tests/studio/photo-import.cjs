// Browser test: importing a photo taken at an angle (finding the paper, dragging corners,
// Whole Photo, Find My Paper, Turn It), Read My Words (with a made-up answer), switching
// the drawing's lines on the page, and Real Photo (the photo as it is, also with no lines).
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
  // Read My Words, answered the way the real reader answers: a long list with no heading of
  // its own, a long paragraph, a box that is only a heading. Placed by where each box was drawn.
  let readSent = null;
  await page.route('**/api/studio/read', async (route) => {
    readSent = `${route.request().headers()['content-type']}, ${route.request().postDataBuffer().length} bytes`;
    await route.fulfill({ json: { name: 'Wormy', boxes: [
      { title: 'Ability 1', text: 'Super dig!\nDig through one wall to save a friend and get a two star speed boost for that tunnel', x: 678, y: 358 },
      { title: 'Stats', text: 'Finish all the deep tunnels on Mud Hill\n40% research on 3 Lost Worms\n2,300 Rain Drops\nLives ♥♥♥\nDigging ★★★\nSpeed ★★\nStamina ★★★\nStealth ★\nWiggling ★★★\nSinging ★★', x: 245, y: 365 },
      { title: 'No Ability 2', text: '', x: 640, y: 725 },
      { title: 'Personality', text: 'A happy personality, always friendly, brave, and helpful, but when it rains too hard he hides under a leaf and sings to himself until the sun comes out', x: 256, y: 693 },
    ] } });
  });
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
  await page.getByRole('button', { name: 'Keep It' }).waitFor();
  const card = () => page.locator('.gn-stage .gn-card').evaluate((c) => [
    c.querySelector('[aria-label="Character name"]').textContent,
    ...[...c.querySelectorAll('.gn-box')].map((b) => `${b.querySelector('.gn-box-title').textContent}: ${b.querySelector('[aria-label$=" text"]').textContent.split('\n')[0]}`),
  ].join(' | '));
  log('  Read My Words sent', readSent, '| helper says:', await page.locator('.gn-bubble-helper').textContent());
  log('  card:', await card());
  await page.screenshot({ path: S + '/shot-words-card.png' });
  await page.getByRole('button', { name: 'Put It Back' }).click();
  log('  Put It Back:', await card());
  await page.getByRole('button', { name: 'Redo' }).click();
  log('  Redo:', await card());

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
  await page.getByRole('button', { name: 'Draw & Color' }).click();
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

  // Real Photo: the straightened photo as it is. It covers the colors, which come back on the lines.
  const typeOf = (img) => img.evaluate(async (e) => { const b = await (await fetch(e.src)).blob(); return [b.type, e.naturalWidth, e.naturalHeight]; });
  const pressed = (name) => side.getByRole('button', { name }).getAttribute('aria-pressed');
  await side.getByRole('button', { name: 'Real Photo' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.gn-stage .gn-portrait img').length === 1);
  await page.waitForTimeout(300);
  log('10 Real Photo on: picture', (await typeOf(page.locator('.gn-stage .gn-portrait img'))).join(' '), '(the straightened sheet) | colors hidden: 1 layer',
    '| Neat Lines and Just My Character disabled:', await side.getByRole('button', { name: 'Neat Lines' }).isDisabled(), await side.getByRole('button', { name: 'Just My Character' }).isDisabled());
  await page.screenshot({ path: S + '/shot-real-photo.png' });
  await page.getByRole('button', { name: 'Draw & Color' }).click();
  await art.waitFor(); await page.waitForTimeout(500);
  const tools = await page.locator('.gn-panel-left .gn-tool').allTextContents();
  const b2 = await art.boundingBox();
  await page.mouse.move(b2.x + b2.width * 0.2, b2.y + b2.height * 0.5); await page.mouse.down();
  await page.mouse.move(b2.x + b2.width * 0.8, b2.y + b2.height * 0.5, { steps: 8 }); await page.mouse.up();
  await page.getByRole('button', { name: 'Done' }).click();
  await page.waitForSelector('.gn-color', { state: 'detached' });
  log('  Draw & Color on the photo: tools', tools.map((t) => t.trim()).join(', '), '| pen line on the page:',
    await page.locator('.gn-stage .gn-portrait svg path').count(), '| photo under it:', await page.locator('.gn-stage .gn-portrait svg image').count());
  await side.getByRole('button', { name: 'Real Photo' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.gn-stage .gn-portrait img').length === 1);
  log('  Real Photo off: colors back', await page.locator('.gn-stage .gn-portrait img').count() === 1,
    '| pen line kept', await page.locator('.gn-stage .gn-portrait svg path').count(), '| Real Photo pressed', await pressed('Real Photo'));

  // A photo with no lines in it: only Real Photo can take it.
  const plain = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 1600; c.height = 1200; const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, c.height); g.addColorStop(0, '#9fd3f5'); g.addColorStop(1, '#f6f1e4'); x.fillStyle = g; x.fillRect(0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.9);
  });
  const [chooser2] = await Promise.all([page.waitForEvent('filechooser'), side.getByRole('button', { name: 'Change Photo' }).click()]);
  await chooser2.setFiles({ name: 'sky.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(plain.split(',')[1], 'base64') });
  await ready(); await page.waitForTimeout(400);
  const good = page.getByRole('button', { name: 'Looks Good!' });
  log('11 no lines: Looks Good! disabled', await good.isDisabled(), '| says:', await page.locator('.gn-note-warn').textContent());
  const dialog = page.getByRole('dialog', { name: 'Clean up your photo' });
  await dialog.getByRole('button', { name: 'Read My Words' }).click();
  await dialog.getByRole('button', { name: 'Real Photo' }).click(); await page.waitForTimeout(400);
  log('  Real Photo: Looks Good! enabled', await good.isEnabled(), '| heading', await page.locator('.gn-import-pane h3').nth(1).textContent(),
    '| Neat Lines disabled', await dialog.getByRole('button', { name: 'Neat Lines' }).isDisabled());
  await good.click();
  await page.waitForSelector('.gn-modal', { state: 'detached' });
  await page.waitForFunction(() => document.querySelector('.gn-stage .gn-portrait img')?.naturalWidth > 0);
  log('  on the card:', (await typeOf(page.locator('.gn-stage .gn-portrait img'))).join(' '), '| switches offered (nothing to switch to):',
    await side.getByRole('button', { name: /Neat Lines|Just My Character|Real Photo/ }).count());
  log('errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
