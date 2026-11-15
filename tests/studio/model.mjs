// Checks comic page titles: the panels start below the title, and a comic page
// made before titles gets one, with its bubbles and pen lines moved down so they
// stay in their panels. No browser needed.
// Run:  node tests/studio/model.mjs
import { INNER_H, TITLE_H, getPart, newComicPage, pageLabel, panelRects, roleOf, withTitles } from '../../src/studio/model.js';

let failed = 0;
const check = (ok, what, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? ` (${detail})` : ''}`);
  if (!ok) failed++;
};

// 1. A new comic page has a title, above the panels.
{
  const page = newComicPage();
  const rects = panelRects('four');
  check(rects[0].y === TITLE_H, 'the panels start below the title', `top ${rects[0].y}`);
  check(Math.abs(rects[3].y + rects[3].h - (INNER_H - 16)) < 0.01, 'and reach the bottom margin');
  check(getPart(page, 'title') === page.title && roleOf(page, 'title') === 'heading', 'the title is a part of its own');
  check(pageLabel(page) === 'Comic page', 'an empty title shows as "Comic page"');
  page.items.push({ id: 'a', kind: 'speech', x: 0, y: 100, w: 180, text: 'Hi Fog!' });
  check(pageLabel(page) === 'Comic page', 'a bubble is not the title');
  page.title.text = ' The Big Escape ';
  check(pageLabel(page) === 'The Big Escape', 'the page list shows the title');
}

// 2. A page from before titles: everything moves down with its panel.
{
  // Where the panels of the four-panel layout were before titles.
  const ch = (INNER_H - 32 - 12) / 2;
  const old = [16, 16 + ch + 12].map((y) => ({ y, h: ch }));
  const page = newComicPage();
  delete page.title;
  page.layout = 'four';
  page.items = [{ id: 'a', kind: 'speech', x: 40, y: old[0].y, w: 180, text: 'Top' }, { id: 'b', kind: 'caption', x: 500, y: old[1].y + 30, w: 200, text: '' }];
  page.strokes = [{ id: 's', color: '#000', size: 6, points: [100, old[0].y + old[0].h, 300, old[1].y, 400, old[1].y + old[1].h] }];
  const book = { id: 'b', pages: [page] };
  const next = withTitles(book);
  const moved = next.pages[0];
  const now = panelRects('four');
  check(book.pages[0].title === undefined, 'the stored book is left as it is');
  check(moved.title?.text === '', 'the page gets an empty title');
  check(moved.items[0].y === now[0].y, 'a bubble at the top of a panel stays at its top', `${moved.items[0].y} vs ${now[0].y}`);
  check(Math.abs(moved.items[1].y - (now[2].y + 30)) <= 3, 'a bubble lower down stays in its panel', `${moved.items[1].y} vs about ${now[2].y + 30}`);
  const p = moved.strokes[0].points;
  const off = Math.max(Math.abs(p[1] - (now[0].y + now[0].h)), Math.abs(p[3] - now[2].y), Math.abs(p[5] - (now[2].y + now[2].h)));
  check(off < 1.5, 'pen lines move with the panel edges', `off by up to ${off.toFixed(1)} px`);
  check(p[0] === 100 && p[2] === 300 && moved.items[0].x === 40, 'nothing moves sideways');
  check(withTitles(next) === next, 'a book that has its titles is not touched again');
}

if (failed) {
  console.log(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nall model checks passed');
